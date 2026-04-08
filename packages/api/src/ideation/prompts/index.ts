/**
 * Stage prompt registry for the ideation pipeline.
 *
 * Maps stage names to their extracted analysis prompts.
 * Each prompt is a model-agnostic system prompt + output format spec.
 */

import { SYSTEM_PROMPT as officeHoursSystem, OUTPUT_FORMAT as officeHoursFormat } from './office-hours'
import { SYSTEM_PROMPT as ceoReviewSystem, OUTPUT_FORMAT as ceoReviewFormat } from './ceo-review'
import { SYSTEM_PROMPT as engReviewSystem, OUTPUT_FORMAT as engReviewFormat } from './eng-review'
import { SYSTEM_PROMPT as designSystem, OUTPUT_FORMAT as designFormat } from './design-consultation'

export interface StagePrompt {
  system: string
  outputFormat: string
}

const STAGE_PROMPTS: Record<string, StagePrompt> = {
  'office-hours': { system: officeHoursSystem, outputFormat: officeHoursFormat },
  'plan-ceo-review': { system: ceoReviewSystem, outputFormat: ceoReviewFormat },
  'plan-eng-review': { system: engReviewSystem, outputFormat: engReviewFormat },
  'design-consultation': { system: designSystem, outputFormat: designFormat },
}

export function getStagePrompt(stage: string): StagePrompt {
  const prompt = STAGE_PROMPTS[stage]
  if (!prompt) {
    throw new Error(`No prompt defined for ideation stage: "${stage}"`)
  }
  return prompt
}
