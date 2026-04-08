/**
 * Skill bridge for ideation pipeline.
 *
 * Manages stage definitions, cumulative context building with truncation,
 * and display name mapping.
 *
 * Per D-07: Each skill stage reads prior artifacts as context.
 *
 * Note: Prompt loading was removed in the prompt extraction refactor.
 * Stage prompts now live in ./prompts/ as purpose-built TypeScript templates
 * instead of loading raw SKILL.md files from the filesystem.
 */

// ── Ideation Stages ────────────────────────────────────────────────────────

/**
 * The 4 skill stages in the ideation pipeline, in execution order.
 * Per D-06: office-hours -> CEO review -> eng review -> design consultation.
 */
export const IDEATION_STAGES = [
  'office-hours',
  'plan-ceo-review',
  'plan-eng-review',
  'design-consultation',
] as const

export type IdeationStageName = typeof IDEATION_STAGES[number]

// ── Stage Display Names ────────────────────────────────────────────────────

const STAGE_DISPLAY_NAMES: Record<IdeationStageName, string> = {
  'office-hours': 'Office Hours',
  'plan-ceo-review': 'CEO Review',
  'plan-eng-review': 'Eng Review',
  'design-consultation': 'Design Consultation',
}

export function getStageDisplayName(stage: string): string {
  return STAGE_DISPLAY_NAMES[stage as IdeationStageName] ?? stage
}

// ── Cumulative Context Builder ─────────────────────────────────────────────

/**
 * Hard cap on cumulative context size in characters (~8K tokens).
 * Prevents unbounded growth as stages accumulate output.
 * 32K chars ≈ 8K tokens for English text.
 */
const MAX_CONTEXT_CHARS = 32_000

/**
 * Build cumulative context from prior stage artifacts.
 *
 * Per D-07: Each skill stage reads prior artifacts as context, building
 * cumulative understanding across the pipeline.
 *
 * Applies a hard truncation cap (8K tokens / 32K chars) to prevent
 * context from growing unbounded across stages.
 *
 * @param artifacts - Map of stage name -> stage output text
 * @returns Formatted context string with all prior stage outputs
 */
export function buildCumulativeContext(artifacts: Map<string, string>): string {
  if (artifacts.size === 0) return ''

  const sections: string[] = ['## Prior Ideation Context\n']

  for (const [stage, content] of artifacts) {
    const displayName = getStageDisplayName(stage)
    sections.push(`### ${displayName} Output\n\n${content}\n`)
  }

  let result = sections.join('\n')

  // Hard truncation cap — keep the most recent context (end of string)
  if (result.length > MAX_CONTEXT_CHARS) {
    const truncated = result.slice(result.length - MAX_CONTEXT_CHARS)
    // Find the first section boundary to avoid cutting mid-sentence
    const sectionStart = truncated.indexOf('### ')
    if (sectionStart > 0) {
      result = '## Prior Ideation Context (truncated)\n\n' + truncated.slice(sectionStart)
    } else {
      result = '## Prior Ideation Context (truncated)\n\n' + truncated
    }
  }

  return result
}
