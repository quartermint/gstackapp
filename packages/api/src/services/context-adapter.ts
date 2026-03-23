/**
 * Adaptive context injection service.
 *
 * Provides model-tier-aware token budgets and builds narrative context
 * strings that fit within those budgets. Per D-08 and D-10.
 */

type ModelTier = "small" | "medium" | "large";

const MODEL_PATTERNS: Array<{ pattern: RegExp; tier: ModelTier }> = [
  { pattern: /70b|72b/i, tier: "large" },
  { pattern: /qwen.*3.*coder|30b|32b/i, tier: "medium" },
];

const CONTEXT_BUDGETS: Record<ModelTier, number> = {
  small: 4096,   // ~16KB text
  medium: 8192,  // ~32KB text
  large: 16384,  // ~64KB text
};

/**
 * Determine model tier from model ID string.
 * Defaults to "small" if modelId is null or no pattern matches.
 */
function getModelTier(modelId: string | null): ModelTier {
  if (!modelId) return "small";

  for (const { pattern, tier } of MODEL_PATTERNS) {
    if (pattern.test(modelId)) return tier;
  }

  return "small";
}

/**
 * Get the token budget for a given model.
 * Returns the number of approximate tokens available for context.
 */
export function getContextBudget(modelId: string | null): number {
  return CONTEXT_BUDGETS[getModelTier(modelId)];
}

/**
 * Truncate text to fit within a token budget, preserving complete lines.
 * Approximate: 4 chars ~= 1 token.
 * Keeps the most recent lines (end of text) when truncation is needed.
 * Adds "[truncated]" marker at the top if truncation occurred.
 */
export function truncateContext(text: string, tokenBudget: number): string {
  const charBudget = tokenBudget * 4;

  if (text.length <= charBudget) {
    return text;
  }

  const lines = text.split("\n");
  const kept: string[] = [];
  let usedChars = 0;
  const truncatedMarker = "[truncated]\n";
  const markerLen = truncatedMarker.length;

  // Walk from end (most recent) to start, keeping lines that fit
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    const lineLen = line.length + 1; // +1 for newline

    if (usedChars + lineLen + markerLen > charBudget && kept.length > 0) {
      break;
    }

    kept.unshift(line);
    usedChars += lineLen;
  }

  if (kept.length < lines.length) {
    return truncatedMarker + kept.join("\n");
  }

  return text;
}

/**
 * Data shape for building narrative context.
 */
export interface NarrativeContextData {
  commits: Array<{ hash: string; message: string; date: string }>;
  captures: Array<{ content: string; createdAt: string }>;
  sessions: Array<{ id: string; source: string; startedAt: string }>;
  gitState: string;
}

/**
 * Build a narrative context string from project data.
 *
 * Budget allocation:
 * - 40% commits
 * - 30% captures
 * - 30% sessions
 *
 * Git state is always included (small, fixed cost).
 * Each section is truncated independently to fit its budget.
 * Most recent items are preserved; oldest are dropped first.
 */
export function buildNarrativeContext(
  data: NarrativeContextData,
  tokenBudget: number
): string {
  const sections: string[] = [];

  // Git state header (fixed, small cost)
  if (data.gitState) {
    sections.push(`## Git State\n${data.gitState}`);
  }

  // Compute section budgets (tokens)
  const commitBudget = Math.floor(tokenBudget * 0.4);
  const captureBudget = Math.floor(tokenBudget * 0.3);
  const sessionBudget = Math.floor(tokenBudget * 0.3);

  // Format commits (most recent first -- already in that order)
  if (data.commits.length > 0) {
    const commitLines = data.commits.map(
      (c) => `- ${c.hash} ${c.message} (${c.date})`
    );
    const commitText = `## Recent Commits\n${commitLines.join("\n")}`;
    sections.push(truncateContext(commitText, commitBudget));
  }

  // Format captures (most recent first)
  if (data.captures.length > 0) {
    const captureLines = data.captures.map(
      (c) => `- [${c.createdAt}] ${c.content}`
    );
    const captureText = `## Captures\n${captureLines.join("\n")}`;
    sections.push(truncateContext(captureText, captureBudget));
  }

  // Format sessions (most recent first)
  if (data.sessions.length > 0) {
    const sessionLines = data.sessions.map(
      (s) => `- ${s.id} (${s.source}) started ${s.startedAt}`
    );
    const sessionText = `## Sessions\n${sessionLines.join("\n")}`;
    sections.push(truncateContext(sessionText, sessionBudget));
  }

  return sections.join("\n\n");
}
