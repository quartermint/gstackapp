import type { ToolAdapter } from './types'
import type { ToolDefinition } from '../types'

const NAME_MAP: Record<string, string> = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  Bash: 'bash',
  Grep: 'grep',
  Glob: 'glob',
}

/**
 * OpenCode adapter — maps canonical PascalCase tool names to lowercase.
 */
export const openCodeAdapter: ToolAdapter = {
  name: 'opencode',

  mapToolName(canonical: string): string {
    const mapped = NAME_MAP[canonical]
    if (!mapped) {
      throw new Error(`OpenCode adapter: unknown canonical tool "${canonical}"`)
    }
    return mapped
  },

  mapToolSchema(canonical: ToolDefinition): ToolDefinition {
    return {
      ...canonical,
      name: this.mapToolName(canonical.name),
    }
  },

  mapToolResult(_toolName: string, result: string): string {
    return result
  },
}
