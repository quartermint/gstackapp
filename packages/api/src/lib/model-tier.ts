import type { MCConfig } from "./config.js";

export type ModelTier = "opus" | "sonnet" | "local" | "unknown";

/**
 * Derive model tier from a model string.
 * Priority: config-driven regex patterns first, then built-in prefix matching.
 * Returns "unknown" for null/undefined model strings.
 * Returns "local" for non-Anthropic model strings (e.g. qwen3-coder-30b).
 */
export function deriveModelTier(
  modelString: string | null | undefined,
  config?: MCConfig
): ModelTier {
  if (!modelString) return "unknown";

  // Config-driven matching (future-proofed)
  if (config?.modelTiers) {
    for (const mapping of config.modelTiers) {
      if (new RegExp(mapping.pattern).test(modelString)) {
        return mapping.tier;
      }
    }
  }

  // Built-in prefix matching (always works as fallback)
  if (modelString.startsWith("claude-opus")) return "opus";
  if (modelString.startsWith("claude-sonnet")) return "sonnet";

  // Non-Anthropic model strings are local models
  return "local";
}
