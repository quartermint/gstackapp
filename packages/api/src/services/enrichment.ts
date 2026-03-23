import type { DrizzleDb } from "../db/index.js";
import { eventBus } from "./event-bus.js";
import {
  getCapture,
  updateCaptureEnrichment,
} from "../db/queries/captures.js";
import { listProjects } from "../db/queries/projects.js";
import { categorizeCapture, isAIAvailable, isLMStudioAvailable } from "./ai-categorizer.js";
import type { EnhancedCategorizationResult } from "./ai-categorizer.js";
import { containsUrl, extractUrls, extractLinkMetadata } from "./link-extractor.js";
import { getFewShotExamplesForCategorization } from "../db/queries/few-shot-examples.js";
import { createExtractionsBatch } from "../db/queries/capture-extractions.js";
import { alignExtractions } from "./grounding.js";

/**
 * Enrich a capture with AI categorization, multi-pass extraction,
 * grounding, and link metadata.
 *
 * Enhanced workflow (v2.0 Phase 33):
 * 1. Update status to "pending_enrichment"
 * 2. Fetch capture content, project list, and few-shot examples
 * 3. Run enhanced AI categorization with few-shot examples
 * 4. Store extractions with post-hoc grounding
 * 5. If URL detected, extract link metadata for first URL
 * 6. Persist all enrichment results + status = "enriched"
 *
 * This implements "persist first, enrich later" -- called async
 * after the capture POST returns to the client.
 */
export async function enrichCapture(
  db: DrizzleDb,
  captureId: string
): Promise<void> {
  // 1. Mark as pending
  updateCaptureEnrichment(db, captureId, { status: "pending_enrichment" });

  // 2. Get capture content, project list, and few-shot examples
  const capture = getCapture(db, captureId);
  const projectList = listProjects(db);
  const fewShotExamples = getFewShotExamplesForCategorization(db);

  // 3. Run enhanced AI categorization with few-shot examples
  // Priority: Gemini -> LM Studio -> safe fallback
  let aiResult: EnhancedCategorizationResult;

  if (isAIAvailable() || isLMStudioAvailable()) {
    aiResult = await categorizeCapture(
      capture.rawContent,
      projectList.map((p) => ({
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
      })),
      fewShotExamples.map((e) => ({
        captureContent: e.captureContent,
        projectSlug: e.projectSlug,
      }))
    );
  } else {
    aiResult = {
      projectSlug: null,
      confidence: 0,
      reasoning: "AI categorization skipped — no Gemini API key or LM Studio configured",
      extractions: [],
    };
  }

  // 4. Store extractions with post-hoc grounding
  if (aiResult.extractions.length > 0) {
    // Run deterministic grounding alignment
    const groundedExtractions = alignExtractions(
      capture.rawContent,
      aiResult.extractions
    );

    // Batch insert extractions with grounding data
    createExtractionsBatch(
      db,
      groundedExtractions.map((ge) => ({
        captureId,
        extractionType: ge.extractionType as "project_ref" | "action_item" | "idea" | "link" | "question",
        content: ge.content,
        confidence: ge.confidence,
        groundingJson:
          ge.grounding.length > 0 ? JSON.stringify(ge.grounding) : null,
      }))
    );
  }

  // 5. Extract link metadata if URL detected
  let linkUrl: string | null = null;
  let linkTitle: string | null = null;
  let linkDescription: string | null = null;
  let linkDomain: string | null = null;
  let linkImage: string | null = null;

  if (containsUrl(capture.rawContent)) {
    const urls = extractUrls(capture.rawContent);
    const firstUrl = urls[0];
    if (firstUrl) {
      linkUrl = firstUrl;
      const metadata = await extractLinkMetadata(firstUrl);
      linkTitle = metadata.title;
      linkDescription = metadata.description;
      linkDomain = metadata.domain;
      linkImage = metadata.image;
    }
  }

  // 6. Persist enrichment results
  // Preserve user-set projectId -- if user explicitly assigned a project,
  // AI categorization does NOT override it (IOS-13).
  const resolvedProjectId = capture.projectId ?? aiResult.projectSlug ?? null;

  const now = new Date();
  updateCaptureEnrichment(db, captureId, {
    projectId: resolvedProjectId,
    aiConfidence: aiResult.confidence,
    aiProjectSlug: aiResult.projectSlug ?? null,
    aiReasoning: aiResult.reasoning,
    linkUrl,
    linkTitle,
    linkDescription,
    linkDomain,
    linkImage,
    enrichedAt: now,
    status: "enriched",
  });

  // Emit domain event for real-time subscribers
  eventBus.emit("mc:event", { type: "capture:enriched", id: captureId });
}
