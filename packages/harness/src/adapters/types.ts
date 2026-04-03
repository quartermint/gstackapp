import type { ToolDefinition } from '../types'

/**
 * Normalizes tool names and schemas across different coding harnesses.
 * Each adapter maps canonical tool names (Claude Code conventions) to
 * harness-specific equivalents.
 */
export interface ToolAdapter {
  /** Adapter identifier (e.g., 'claude-code', 'opencode', 'codex') */
  readonly name: string

  /** Map canonical tool name to harness-specific name */
  mapToolName(canonical: string): string

  /** Transform canonical tool schema to harness-specific schema */
  mapToolSchema(canonical: ToolDefinition): ToolDefinition

  /** Transform harness-specific result back to canonical format */
  mapToolResult(toolName: string, result: string): string
}
