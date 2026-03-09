import type { DrizzleDb } from "../db/index.js";
import {
  getCapture,
  updateCaptureEnrichment,
} from "../db/queries/captures.js";
import { listProjects } from "../db/queries/projects.js";
import { categorizeCapture } from "./ai-categorizer.js";
import { containsUrl, extractUrls, extractLinkMetadata } from "./link-extractor.js";

/**
 * Enrich a capture with AI categorization and link metadata.
 *
 * Workflow:
 * 1. Update status to "pending_enrichment"
 * 2. Fetch capture content and fresh project list
 * 3. Run AI categorization
 * 4. If URL detected, extract link metadata for first URL
 * 5. Persist all enrichment results + status = "enriched"
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

  // 2. Get capture content and fresh project list
  const capture = getCapture(db, captureId);
  const projectList = listProjects(db);

  // 3. Run AI categorization
  const aiResult = await categorizeCapture(
    capture.rawContent,
    projectList.map((p) => ({
      slug: p.slug,
      name: p.name,
      tagline: p.tagline,
    }))
  );

  // 4. Extract link metadata if URL detected
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

  // 5. Persist enrichment results
  const now = new Date();
  updateCaptureEnrichment(db, captureId, {
    projectId: aiResult.projectSlug ?? null,
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
}
