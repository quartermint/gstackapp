import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Check whether an OpenAI API key is configured.
 * Without it, AI categorization cannot function.
 */
export function isAIAvailable(): boolean {
  return Boolean(process.env["OPENAI_API_KEY"]);
}

const categorizationSchema = z.object({
  projectSlug: z
    .string()
    .nullable()
    .describe("Project slug that best matches the capture, or null if no match"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score from 0 to 1"),
  reasoning: z
    .string()
    .describe("Brief explanation of the categorization decision"),
});

export type CategorizationResult = z.infer<typeof categorizationSchema>;

/**
 * Use AI to categorize a capture to a project.
 * Returns { projectSlug, confidence, reasoning }.
 * If confidence is below CONFIDENCE_THRESHOLD (0.6), projectSlug is set to null.
 * On AI failure, returns a safe fallback (null projectSlug, 0 confidence).
 */
export async function categorizeCapture(
  content: string,
  projects: Array<{ slug: string; name: string; tagline: string | null }>
): Promise<CategorizationResult> {
  try {
    const projectContext = projects
      .map(
        (p) => `- ${p.slug}: ${p.name}${p.tagline ? ` (${p.tagline})` : ""}`
      )
      .join("\n");

    const modelId = process.env["AI_MODEL"] ?? "gpt-4o-mini";

    const { output } = await generateText({
      model: openai(modelId),
      output: Output.object({ schema: categorizationSchema }),
      prompt: `You are a personal project categorizer. Given a raw thought/capture, determine which project it belongs to.

Available projects:
${projectContext}

Capture: "${content}"

Return the best matching project slug and your confidence (0-1). If no project is a good match, return null for projectSlug with low confidence.`,
    });

    if (!output) {
      return {
        projectSlug: null,
        confidence: 0,
        reasoning: "AI categorization failed",
      };
    }

    // Apply confidence threshold: below threshold means no project match
    if (output.confidence < CONFIDENCE_THRESHOLD) {
      return {
        projectSlug: null,
        confidence: output.confidence,
        reasoning: output.reasoning,
      };
    }

    return output;
  } catch {
    return {
      projectSlug: null,
      confidence: 0,
      reasoning: "AI categorization failed",
    };
  }
}
