import type { ToolAdapter } from './types'
import type { ToolDefinition } from '../types'

/**
 * Claude Code adapter — identity mapping.
 * Claude Code IS the canonical tool set, so all methods pass through unchanged.
 */
export const claudeCodeAdapter: ToolAdapter = {
  name: 'claude-code',

  mapToolName(canonical: string): string {
    return canonical
  },

  mapToolSchema(canonical: ToolDefinition): ToolDefinition {
    return canonical
  },

  mapToolResult(_toolName: string, result: string): string {
    return result
  },
}
