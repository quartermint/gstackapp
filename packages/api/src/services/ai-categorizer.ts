import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

export const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Check whether a Google AI API key is configured.
 * Without it, AI categorization cannot function (unless LM Studio fallback is used).
 */
export function isAIAvailable(): boolean {
  return Boolean(process.env["GEMINI_API_KEY"] || process.env["GOOGLE_GENERATIVE_AI_API_KEY"]);
}

/**
 * Check whether LM Studio is available as a fallback.
 */
export function isLMStudioAvailable(): boolean {
  return Boolean(process.env["LM_STUDIO_URL"] || process.env["LM_STUDIO_BASE_URL"]);
}

// --- Extraction types ---

export const extractionTypeValues = [
  "project_ref",
  "action_item",
  "idea",
  "link",
  "question",
] as const;

export type ExtractionType = (typeof extractionTypeValues)[number];

export interface ExtractionResult {
  extractionType: ExtractionType;
  content: string;
  confidence: number;
}

export interface EnhancedCategorizationResult {
  projectSlug: string | null;
  confidence: number;
  reasoning: string;
  extractions: ExtractionResult[];
}

// Legacy type for backward compatibility
export type CategorizationResult = Pick<
  EnhancedCategorizationResult,
  "projectSlug" | "confidence" | "reasoning"
>;

// --- Few-shot example type ---

export interface FewShotExample {
  captureContent: string;
  projectSlug: string;
}

// --- Schemas ---

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
  extractions: z
    .array(
      z.object({
        extractionType: z
          .enum(["project_ref", "action_item", "idea", "link", "question"])
          .describe("Type of extraction"),
        content: z.string().describe("Extracted content"),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe("Confidence for this extraction"),
      })
    )
    .describe("Multi-pass extractions found in the capture text"),
});

// --- Prompt building ---

function buildFewShotSection(examples: FewShotExample[]): string {
  if (examples.length === 0) return "";

  const exampleLines = examples
    .map(
      (ex, i) =>
        `Example ${i + 1}:\n  Capture: "${ex.captureContent}"\n  Project: ${ex.projectSlug}`
    )
    .join("\n\n");

  return `\nHere are examples of correctly categorized captures:\n\n${exampleLines}\n\nUse these examples to guide your categorization.\n`;
}

function buildPrompt(
  content: string,
  projects: Array<{ slug: string; name: string; tagline: string | null }>,
  fewShotExamples: FewShotExample[]
): string {
  const projectContext = projects
    .map(
      (p) => `- ${p.slug}: ${p.name}${p.tagline ? ` (${p.tagline})` : ""}`
    )
    .join("\n");

  const fewShotSection = buildFewShotSection(fewShotExamples);

  return `You are a personal project categorizer and capture analyzer. Given a raw thought/capture, determine:
1. Which project it belongs to (if any)
2. What kind of content it contains (action items, ideas, links, questions, project references)

Available projects:
${projectContext}
${fewShotSection}
Capture: "${content}"

Return the best matching project slug and your confidence (0-1). If no project is a good match, return null for projectSlug with low confidence.

Also extract any notable content from the capture:
- project_ref: References to specific projects
- action_item: Tasks or things to do
- idea: New ideas or suggestions
- link: URLs or references to external resources
- question: Questions that need answers

Return extractions as an array. Each extraction should include the type, the relevant text content, and a confidence score.`;
}

// --- LM Studio fallback ---

async function callLMStudio(prompt: string): Promise<EnhancedCategorizationResult | null> {
  const baseUrl = process.env["LM_STUDIO_URL"] || process.env["LM_STUDIO_BASE_URL"] || "http://localhost:1234";
  const url = `${baseUrl}/v1/chat/completions`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are a capture categorizer. Respond ONLY with valid JSON matching the requested schema." },
          { role: "user", content: prompt + "\n\nRespond with a JSON object containing: projectSlug (string|null), confidence (0-1), reasoning (string), extractions (array of {extractionType, content, confidence})." },
        ],
        temperature: 0.1,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const messageContent = data.choices?.[0]?.message?.content;
    if (!messageContent) return null;

    const parsed = JSON.parse(messageContent) as Record<string, unknown>;
    const result = categorizationSchema.safeParse(parsed);
    if (!result.success) {
      // Try to extract at least the categorization
      return {
        projectSlug: typeof parsed.projectSlug === "string" ? parsed.projectSlug : null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "LM Studio response",
        extractions: [],
      };
    }

    return result.data;
  } catch {
    return null;
  }
}

// --- Main categorization function ---

/**
 * Use AI to categorize a capture to a project and extract content types.
 * Enhanced version with few-shot examples, multi-pass extraction, and LLM fallback.
 *
 * Priority: Gemini (primary) -> LM Studio (fallback) -> safe fallback (no AI)
 */
export async function categorizeCapture(
  content: string,
  projects: Array<{ slug: string; name: string; tagline: string | null }>,
  fewShotExamples: FewShotExample[] = []
): Promise<EnhancedCategorizationResult> {
  const prompt = buildPrompt(content, projects, fewShotExamples);

  // Try Gemini first
  if (isAIAvailable()) {
    try {
      const modelId = process.env["AI_MODEL"] ?? "gemini-3-flash-preview";

      const { output } = await generateText({
        model: google(modelId),
        output: Output.object({ schema: categorizationSchema }),
        prompt,
      });

      if (output) {
        // Apply confidence threshold
        const projectSlug =
          output.confidence < CONFIDENCE_THRESHOLD ? null : output.projectSlug;

        return {
          projectSlug,
          confidence: output.confidence,
          reasoning: output.reasoning,
          extractions: output.extractions ?? [],
        };
      }
    } catch {
      // Fall through to LM Studio
    }
  }

  // Try LM Studio fallback
  if (isLMStudioAvailable()) {
    const lmResult = await callLMStudio(prompt);
    if (lmResult) {
      const projectSlug =
        lmResult.confidence < CONFIDENCE_THRESHOLD ? null : lmResult.projectSlug;
      return {
        ...lmResult,
        projectSlug,
        reasoning: `[LM Studio] ${lmResult.reasoning}`,
      };
    }
  }

  // Safe fallback: no AI available
  return {
    projectSlug: null,
    confidence: 0,
    reasoning: "AI categorization unavailable — no Gemini API key or LM Studio",
    extractions: [],
  };
}

// --- Prompt validation ---

/**
 * Validate that few-shot examples still produce correct categorizations.
 * Returns list of examples that failed validation.
 * Called at server startup (CAP-06).
 */
export async function validateFewShotExamples(
  examples: FewShotExample[],
  projects: Array<{ slug: string; name: string; tagline: string | null }>
): Promise<Array<{ example: FewShotExample; predicted: string | null; expected: string }>> {
  const failures: Array<{ example: FewShotExample; predicted: string | null; expected: string }> = [];

  if (!isAIAvailable() && !isLMStudioAvailable()) {
    return failures; // Can't validate without AI
  }

  // Only validate a subset to avoid API overuse at startup
  const sampled = examples.slice(0, 5);

  for (const example of sampled) {
    // Test without the example itself in few-shot (avoid self-reference)
    const otherExamples = examples.filter((e) => e !== example);
    const result = await categorizeCapture(
      example.captureContent,
      projects,
      otherExamples
    );

    if (result.projectSlug !== example.projectSlug) {
      failures.push({
        example,
        predicted: result.projectSlug,
        expected: example.projectSlug,
      });
    }
  }

  return failures;
}
