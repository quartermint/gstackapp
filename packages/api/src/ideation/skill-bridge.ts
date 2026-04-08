/**
 * Skill bridge for ideation pipeline.
 *
 * Loads gstack skill prompts from filesystem, builds cumulative context
 * from prior stage artifacts, and assembles full ideation prompts.
 *
 * Per D-02, D-03: Skills discovered dynamically from ~/.claude/skills/gstack/ — no hardcoded skill logic.
 * Per D-07: Each skill stage reads prior artifacts as context.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

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

// ── Skill Prompt Loading ───────────────────────────────────────────────────

/**
 * Load a skill prompt (SKILL.md) from the gstack skills directory.
 *
 * Per D-02: Dynamic filesystem discovery, no hardcoded skill logic.
 * Per Pitfall 1: Read SKILL.md directly — do NOT use SkillRegistry.
 *
 * @param skillName - Name of the skill directory (e.g., 'office-hours')
 * @returns The full SKILL.md content as the system prompt
 * @throws If the skill file is not found
 */
export function loadSkillPrompt(skillName: string): string {
  // T-15-02: Validate skillName against known stages to prevent path traversal
  const validStages: readonly string[] = IDEATION_STAGES
  if (!validStages.includes(skillName)) {
    throw new Error(
      `Unknown ideation skill: "${skillName}". Valid stages: ${IDEATION_STAGES.join(', ')}`
    )
  }

  const skillPath = join(homedir(), '.claude', 'skills', 'gstack', skillName, 'SKILL.md')

  if (!existsSync(skillPath)) {
    throw new Error(
      `Skill prompt not found: ${skillPath}. Ensure gstack skills are installed at ~/.claude/skills/gstack/`
    )
  }

  return readFileSync(skillPath, 'utf-8')
}

// ── Cumulative Context Builder ─────────────────────────────────────────────

/**
 * Build cumulative context from prior stage artifacts.
 *
 * Per D-07: Each skill stage reads prior artifacts as context, building
 * cumulative understanding across the pipeline.
 *
 * @param artifacts - Map of stage name -> artifact file path
 * @returns Formatted context string with all prior stage outputs
 */
export function buildCumulativeContext(artifacts: Map<string, string>): string {
  if (artifacts.size === 0) return ''

  const sections: string[] = ['## Prior Ideation Context\n']

  for (const [stage, artifactPath] of artifacts) {
    const displayName = getStageDisplayName(stage)

    try {
      if (existsSync(artifactPath)) {
        const content = readFileSync(artifactPath, 'utf-8')
        sections.push(`### ${displayName} Output\n\n${content}\n`)
      } else {
        sections.push(`### ${displayName} Output\n\n(Artifact file not found: ${artifactPath})\n`)
      }
    } catch (err) {
      sections.push(`### ${displayName} Output\n\n(Error reading artifact: ${err instanceof Error ? err.message : String(err)})\n`)
    }
  }

  return sections.join('\n')
}

// ── Prompt Assembly ────────────────────────────────────────────────────────

/**
 * Assemble the full ideation prompt for a given stage.
 *
 * Combines the skill system prompt, prior context from earlier stages,
 * and the user's original idea into a single prompt for the agent loop.
 *
 * @param stage - Current skill stage name
 * @param priorContext - Cumulative context from buildCumulativeContext()
 * @param userIdea - The user's original idea text
 * @returns Assembled prompt string
 */
export function buildIdeationPrompt(
  stage: string,
  priorContext: string,
  userIdea: string
): string {
  const skillPrompt = loadSkillPrompt(stage)
  const displayName = getStageDisplayName(stage)

  const parts: string[] = [skillPrompt]

  if (priorContext) {
    parts.push(priorContext)
  }

  parts.push(`## User's Idea\n\n${userIdea}`)
  parts.push(`Execute the ${displayName} analysis for this idea.`)

  return parts.join('\n\n')
}
