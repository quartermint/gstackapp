import { config as loadDotenv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env')
if (existsSync(envPath)) loadDotenv({ path: envPath })

export interface HarnessConfig {
  anthropicApiKey?: string
  geminiApiKey?: string
  openaiApiKey?: string
  localApiUrl?: string
  pipelineProfile: 'quality' | 'balanced' | 'budget' | 'local'
}

export function loadHarnessConfig(): HarnessConfig {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    localApiUrl: process.env.LOCAL_API_URL,
    pipelineProfile: (process.env.PIPELINE_PROFILE as HarnessConfig['pipelineProfile']) ?? 'balanced',
  }
}
