import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { isAIAvailable, CONFIDENCE_THRESHOLD } from "./ai-categorizer.js";

const starIntentSchema = z.object({
  intent: z
    .enum(["reference", "tool", "try", "inspiration"])
    .nullable()
    .describe(
      "The user's likely intent for starring this repo: " +
        "reference (read/learn later), " +
        "tool (use this in a project), " +
        "try (experiment/evaluate), " +
        "inspiration (design/architecture reference)"
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score from 0 to 1"),
  reasoning: z
    .string()
    .describe("Brief explanation of the categorization decision"),
});

export type StarCategorizationResult = z.infer<typeof starIntentSchema>;

/**
 * Use AI to classify a GitHub star's intent.
 * Input: repo description + topics + language (NOT full README).
 * Returns { intent, confidence, reasoning }.
 * If confidence is below CONFIDENCE_THRESHOLD (0.6), intent is set to null.
 * On AI failure, returns a safe fallback (null intent, 0 confidence).
 */
export async function categorizeStarIntent(star: {
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
}): Promise<StarCategorizationResult> {
  try {
    if (!isAIAvailable()) {
      return {
        intent: null,
        confidence: 0,
        reasoning: "AI categorization skipped — no GEMINI_API_KEY configured",
      };
    }

    const modelId = process.env["AI_MODEL"] ?? "gemini-3-flash-preview";

    const topicsStr = star.topics.length > 0 ? star.topics.join(", ") : "none";
    const descStr = star.description ?? "No description";
    const langStr = star.language ?? "Unknown";

    const { output } = await generateText({
      model: google(modelId),
      output: Output.object({ schema: starIntentSchema }),
      prompt: `You are categorizing why a developer starred a GitHub repository. Based on the repo metadata, classify the likely intent.

Intent categories:
- reference: Educational content, documentation, tutorials, specs — user wants to read/learn from it later
- tool: Libraries, frameworks, CLIs, packages — user wants to USE this in their projects
- try: Interesting projects to experiment with, evaluate, or run locally
- inspiration: Architecture examples, design systems, novel approaches — user wants to reference the approach, not the code

Repository:
- Name: ${star.fullName}
- Description: ${descStr}
- Language: ${langStr}
- Topics: ${topicsStr}

Return the most likely intent category and your confidence.`,
    });

    if (!output) {
      return {
        intent: null,
        confidence: 0,
        reasoning: "AI categorization failed — no output",
      };
    }

    // Apply confidence threshold
    if (output.confidence < CONFIDENCE_THRESHOLD) {
      return {
        intent: null,
        confidence: output.confidence,
        reasoning: output.reasoning,
      };
    }

    return output;
  } catch {
    return {
      intent: null,
      confidence: 0,
      reasoning: "AI categorization failed",
    };
  }
}
