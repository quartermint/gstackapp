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
import { fetchTweetContent, TWEET_URL_PATTERN } from "./tweet-fetcher.js";
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
  captureId: string,
  deviceHint?: {
    projectSlug: string | null;
    confidence: number;
    extractionType?: string | null;
    reasoning?: string | null;
    classifiedAt: string;
    classifiedOnDevice: true;
  }
): Promise<void> {
  // 1. Mark as pending
  updateCaptureEnrichment(db, captureId, { status: "pending_enrichment" });

  // 2. Get capture content, project list, and few-shot examples
  const capture = getCapture(db, captureId);

  // EDGE-03: Smart routing -- high-confidence device hints skip AI categorization
  if (deviceHint && deviceHint.confidence > 0.8 && deviceHint.projectSlug) {
    // Trust device classification, skip AI call
    const resolvedProjectId = capture.projectId ?? deviceHint.projectSlug;
    const now = new Date();
    updateCaptureEnrichment(db, captureId, {
      projectId: resolvedProjectId,
      aiConfidence: deviceHint.confidence,
      aiProjectSlug: deviceHint.projectSlug,
      aiReasoning: `Device-classified: ${deviceHint.reasoning ?? "on-device Foundation Models"}`,
      enrichedAt: now,
      status: "enriched",
    });
    eventBus.emit("mc:event", { type: "capture:enriched", id: captureId });
    return;
  }

  // 3. Fetch link content BEFORE AI categorization so Gemini sees the actual content
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

      // Tweet URLs use GraphQL API for full text; everything else uses OG scraper
      if (TWEET_URL_PATTERN.test(firstUrl)) {
        const tweet = await fetchTweetContent(firstUrl);
        linkTitle = tweet.content?.slice(0, 200) ?? null;
        linkDescription = tweet.content;
        linkDomain = firstUrl.includes("twitter.com") ? "twitter.com" : "x.com";
        linkImage = null;
      } else {
        const metadata = await extractLinkMetadata(firstUrl);
        linkTitle = metadata.title;
        linkDescription = metadata.description;
        linkDomain = metadata.domain;
        linkImage = metadata.image;
      }
    }
  }

  // 4. Build categorization input: use fetched content when available, not just the URL
  const categorizationContent = linkDescription
    ? `${capture.rawContent}\n\n--- Fetched content ---\n${linkDescription}`
    : capture.rawContent;

  const projectList = listProjects(db);
  const fewShotExamples = getFewShotExamplesForCategorization(db);

  // 5. Run enhanced AI categorization with few-shot examples
  // Priority: Gemini -> LM Studio -> safe fallback
  let aiResult: EnhancedCategorizationResult;

  if (isAIAvailable() || isLMStudioAvailable()) {
    aiResult = await categorizeCapture(
      categorizationContent,
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

  // 6. Store extractions with post-hoc grounding
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

  // 7. Persist enrichment results
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
