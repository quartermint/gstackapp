import type { ToolAdapter } from './types'
import type { ToolDefinition } from '../types'

const NAME_MAP: Record<string, string> = {
  Read: 'shell',
  Write: 'apply_patch',
  Edit: 'apply_patch',
  Bash: 'shell',
  Grep: 'shell',
  Glob: 'shell',
}

/** Shell tool schema used by Codex */
const SHELL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    cmd: {
      type: 'array',
      items: { type: 'string' },
      description: 'Command and arguments to execute',
    },
  },
  required: ['cmd'],
}

/** Apply-patch tool schema used by Codex */
const APPLY_PATCH_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    patch: {
      type: 'string',
      description: 'Unified diff patch to apply',
    },
  },
  required: ['patch'],
}

/**
 * Codex adapter — maps 6 canonical tools to Codex's 2 native tools
 * (shell and apply_patch).
 */
export const codexAdapter: ToolAdapter = {
  name: 'codex',

  mapToolName(canonical: string): string {
    const mapped = NAME_MAP[canonical]
    if (!mapped) {
      throw new Error(`Codex adapter: unknown canonical tool "${canonical}"`)
    }
    return mapped
  },

  mapToolSchema(canonical: ToolDefinition): ToolDefinition {
    const targetName = this.mapToolName(canonical.name)
    return {
      name: targetName,
      description: canonical.description,
      inputSchema: targetName === 'shell' ? { ...SHELL_SCHEMA } : { ...APPLY_PATCH_SCHEMA },
    }
  },

  mapToolResult(_toolName: string, result: string): string {
    return result
  },
}
