import { z } from 'zod'
import { config as loadDotenv } from 'dotenv'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Walk up from this module's directory looking for the package root
 * (the directory containing a package.json with name "@gstackapp/api").
 * Falls back to process.cwd() if not found (standalone/test scenarios).
 */
export function findProjectRoot(): string {
  let dir = import.meta.dirname
  while (dir !== resolve(dir, '..')) {
    const pkgPath = resolve(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        if (pkg.name === '@gstackapp/api') return dir
      } catch {
        // malformed package.json, skip
      }
    }
    dir = resolve(dir, '..')
  }
  return process.cwd()
}

const PROJECT_ROOT = findProjectRoot()

// Load .env from project root, fallback to cwd
const envPath = resolve(PROJECT_ROOT, '.env')
loadDotenv({ path: existsSync(envPath) ? envPath : resolve(process.cwd(), '.env') })

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  databasePath: z.string().default('./data/gstackapp.db').transform(
    (p) => (p.startsWith('/') ? p : resolve(process.cwd(), p))
  ),
  githubAppId: z.coerce.number(),
  githubPrivateKey: z.string(),
  githubWebhookSecret: z.string(),
  githubClientId: z.string().optional(),
  githubClientSecret: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  voyageApiKey: z.string().optional(),
  githubAppSlug: z.string().optional(),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  geminiApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  localApiUrl: z.string().optional(),
  pipelineProfile: z.enum(['quality', 'balanced', 'budget', 'local']).default('balanced'),
})

export type Config = z.infer<typeof configSchema>

/**
 * Resolve the GitHub App private key from either a file path or inline env var.
 * Prefers GITHUB_PRIVATE_KEY_PATH (reads PEM file) over GITHUB_PRIVATE_KEY (inline with \n replacement).
 */
function resolvePrivateKey(): string {
  const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH
  if (keyPath && existsSync(keyPath)) {
    return readFileSync(keyPath, 'utf-8')
  }
  const key = process.env.GITHUB_PRIVATE_KEY
  if (key) {
    return key.replace(/\\n/g, '\n')
  }
  throw new Error(
    'GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH required. ' +
    'Set GITHUB_PRIVATE_KEY_PATH to a PEM file path, or GITHUB_PRIVATE_KEY with \\n-escaped newlines.'
  )
}

export const config = configSchema.parse({
  port: process.env.PORT,
  databasePath: process.env.DATABASE_PATH,
  githubAppId: process.env.GITHUB_APP_ID,
  githubPrivateKey: resolvePrivateKey(),
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  voyageApiKey: process.env.VOYAGE_API_KEY,
  githubAppSlug: process.env.GITHUB_APP_SLUG,
  nodeEnv: process.env.NODE_ENV,
  geminiApiKey: process.env.GEMINI_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  localApiUrl: process.env.LOCAL_API_URL,
  pipelineProfile: process.env.PIPELINE_PROFILE,
})
