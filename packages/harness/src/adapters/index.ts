import type { ToolAdapter } from './types'
import { claudeCodeAdapter } from './claude-code'
import { openCodeAdapter } from './opencode'
import { codexAdapter } from './codex'

export type { ToolAdapter } from './types'
export { claudeCodeAdapter } from './claude-code'
export { openCodeAdapter } from './opencode'
export { codexAdapter } from './codex'

const ADAPTERS: Record<string, ToolAdapter> = {
  'claude-code': claudeCodeAdapter,
  'opencode': openCodeAdapter,
  'codex': codexAdapter,
}

/**
 * Get a tool adapter by harness name.
 * @throws Error if adapter name is not recognized
 */
export function getAdapter(name: string): ToolAdapter {
  const adapter = ADAPTERS[name]
  if (!adapter) {
    throw new Error(`Unknown adapter: "${name}". Available: ${Object.keys(ADAPTERS).join(', ')}`)
  }
  return adapter
}
