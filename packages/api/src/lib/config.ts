import { z } from 'zod'
import { config as loadDotenv } from 'dotenv'
import { readFileSync, existsSync } from 'node:fs'

loadDotenv()

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  databasePath: z.string().default('./data/gstackapp.db'),
  githubAppId: z.coerce.number(),
  githubPrivateKey: z.string(),
  githubWebhookSecret: z.string(),
  githubClientId: z.string().optional(),
  githubClientSecret: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
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
  nodeEnv: process.env.NODE_ENV,
})
