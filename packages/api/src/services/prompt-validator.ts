/**
 * Startup prompt validation for few-shot examples.
 *
 * Per D-03: validates that existing few-shot examples still produce
 * correct categorization results. Runs asynchronously at startup
 * (fire-and-forget) and logs warnings for any mismatches.
 *
 * This catches drift: if the AI model changes behavior or few-shot
 * examples become stale, operators see warnings in the server log.
 */

import { categorizeCapture } from "./ai-categorizer.js";
import { getFewShotExamplesForCategorization } from "../db/queries/few-shot-examples.js";
import { listProjects } from "../db/queries/projects.js";
import type { DrizzleDb } from "../db/index.js";

/**
 * Validate few-shot examples by running them through the categorizer
 * and comparing predicted vs expected project slug.
 *
 * Non-blocking: catches all errors internally.
 * Called at server startup via fire-and-forget pattern.
 *
 * @param db - Database connection
 * @param maxSamples - Maximum examples to validate (default 5)
 */
export async function validatePromptExamples(
  db: DrizzleDb,
  maxSamples = 5
): Promise<void> {
  try {
    const examples = getFewShotExamplesForCategorization(db, maxSamples);

    if (examples.length === 0) {
      console.log("[prompt-validator] No few-shot examples to validate");
      return;
    }

    const projectList = listProjects(db);
    const projectInfos = projectList.map((p) => ({
      slug: p.slug,
      name: p.name,
      tagline: p.tagline,
    }));

    const sampled = examples.slice(0, maxSamples);
    let matchCount = 0;

    for (const example of sampled) {
      try {
        // Run with empty examples array (zero-shot baseline)
        const result = await categorizeCapture(
          example.captureContent,
          projectInfos,
          []
        );

        if (result.projectSlug === example.projectSlug) {
          matchCount++;
        } else {
          console.warn(
            `[prompt-validator] Example mismatch: "${example.captureContent.slice(0, 50)}..." expected ${example.projectSlug}, got ${result.projectSlug}`
          );
        }
      } catch {
        // Individual example failure shouldn't stop validation
        console.warn(
          `[prompt-validator] Failed to validate example "${example.captureContent.slice(0, 50)}..."`
        );
      }
    }

    console.log(
      `[prompt-validator] Prompt validation: ${matchCount}/${sampled.length} examples matched`
    );
  } catch (err) {
    console.error("[prompt-validator] Validation failed:", err);
  }
}
