/**
 * Tests for extracted ideation stage prompts.
 *
 * Validates that each stage has well-formed, model-agnostic prompts
 * that don't contain SKILL.md-specific content.
 */

import { describe, it, expect } from 'vitest'
import { getStagePrompt } from '../ideation/prompts'
import { IDEATION_STAGES } from '../ideation/skill-bridge'

// SKILL.md artifacts that should never appear in extracted prompts
const SKILLMD_MARKERS = [
  'AskUserQuestion',
  'gstack-config',
  'PLAN MODE EXCEPTION',
  '~/.gstack/',
  'telemetry',
  '_TEL_START',
  'mkdir -p',
  'touch ~/.gstack',
  'gstack-update-check',
  'SKILL_PREFIX',
  'PROACTIVE_PROMPTED',
  'LAKE_INTRO',
  'SPAWNED_SESSION',
  'run first)',
  'run last)',
]

describe('stage prompts', () => {
  for (const stage of IDEATION_STAGES) {
    describe(stage, () => {
      it('exports non-empty SYSTEM_PROMPT and OUTPUT_FORMAT', () => {
        const prompt = getStagePrompt(stage)
        expect(prompt.system.length).toBeGreaterThan(100)
        expect(prompt.outputFormat.length).toBeGreaterThan(50)
      })

      it('system prompt is under 5KB', () => {
        const prompt = getStagePrompt(stage)
        expect(prompt.system.length).toBeLessThan(5120)
      })

      it('output format is under 2KB', () => {
        const prompt = getStagePrompt(stage)
        expect(prompt.outputFormat.length).toBeLessThan(2048)
      })

      it('contains no SKILL.md-specific content', () => {
        const prompt = getStagePrompt(stage)
        const combined = prompt.system + prompt.outputFormat

        for (const marker of SKILLMD_MARKERS) {
          expect(combined).not.toContain(marker)
        }
      })

      it('output format specifies markdown section headers', () => {
        const prompt = getStagePrompt(stage)
        expect(prompt.outputFormat).toContain('## ')
      })
    })
  }

  it('throws for unknown stage', () => {
    expect(() => getStagePrompt('unknown-stage')).toThrow('No prompt defined')
  })
})
