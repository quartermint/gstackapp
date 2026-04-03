import { describe, it, expect } from 'vitest'
import { getAdapter } from '../adapters/index'
import { claudeCodeAdapter } from '../adapters/claude-code'
import { openCodeAdapter } from '../adapters/opencode'
import { codexAdapter } from '../adapters/codex'
import type { ToolDefinition } from '../types'

const mockToolDef: ToolDefinition = {
  name: 'Read',
  description: 'Read a file',
  inputSchema: { type: 'object', properties: { file_path: { type: 'string' } } },
}

describe('Claude Code Adapter', () => {
  it('has name "claude-code"', () => {
    expect(claudeCodeAdapter.name).toBe('claude-code')
  })

  it('mapToolName returns identity for all canonical tools', () => {
    const tools = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob']
    for (const tool of tools) {
      expect(claudeCodeAdapter.mapToolName(tool)).toBe(tool)
    }
  })

  it('mapToolSchema returns unchanged ToolDefinition', () => {
    const result = claudeCodeAdapter.mapToolSchema(mockToolDef)
    expect(result).toBe(mockToolDef) // same reference
  })

  it('mapToolResult returns unchanged string', () => {
    expect(claudeCodeAdapter.mapToolResult('Read', 'file contents')).toBe('file contents')
  })
})

describe('OpenCode Adapter', () => {
  it('has name "opencode"', () => {
    expect(openCodeAdapter.name).toBe('opencode')
  })

  it('maps canonical tool names to lowercase', () => {
    expect(openCodeAdapter.mapToolName('Read')).toBe('read')
    expect(openCodeAdapter.mapToolName('Write')).toBe('write')
    expect(openCodeAdapter.mapToolName('Edit')).toBe('edit')
    expect(openCodeAdapter.mapToolName('Bash')).toBe('bash')
    expect(openCodeAdapter.mapToolName('Grep')).toBe('grep')
    expect(openCodeAdapter.mapToolName('Glob')).toBe('glob')
  })

  it('throws on unknown canonical tool', () => {
    expect(() => openCodeAdapter.mapToolName('UnknownTool')).toThrow('unknown canonical tool')
  })

  it('mapToolSchema clones definition with mapped name', () => {
    const result = openCodeAdapter.mapToolSchema(mockToolDef)
    expect(result.name).toBe('read')
    expect(result.description).toBe(mockToolDef.description)
    expect(result.inputSchema).toEqual(mockToolDef.inputSchema)
  })

  it('mapToolResult returns unchanged string', () => {
    expect(openCodeAdapter.mapToolResult('read', 'output')).toBe('output')
  })
})

describe('Codex Adapter', () => {
  it('has name "codex"', () => {
    expect(codexAdapter.name).toBe('codex')
  })

  it('maps Read/Bash/Grep/Glob to "shell"', () => {
    expect(codexAdapter.mapToolName('Read')).toBe('shell')
    expect(codexAdapter.mapToolName('Bash')).toBe('shell')
    expect(codexAdapter.mapToolName('Grep')).toBe('shell')
    expect(codexAdapter.mapToolName('Glob')).toBe('shell')
  })

  it('maps Write/Edit to "apply_patch"', () => {
    expect(codexAdapter.mapToolName('Write')).toBe('apply_patch')
    expect(codexAdapter.mapToolName('Edit')).toBe('apply_patch')
  })

  it('mapToolSchema for Read transforms to shell format with cmd array', () => {
    const result = codexAdapter.mapToolSchema(mockToolDef)
    expect(result.name).toBe('shell')
    expect(result.inputSchema).toHaveProperty('properties')
    const props = result.inputSchema.properties as Record<string, unknown>
    expect(props).toHaveProperty('cmd')
  })

  it('mapToolResult returns unchanged string', () => {
    expect(codexAdapter.mapToolResult('shell', 'output')).toBe('output')
  })
})

describe('getAdapter factory', () => {
  it('returns claude-code adapter', () => {
    const adapter = getAdapter('claude-code')
    expect(adapter.name).toBe('claude-code')
  })

  it('returns opencode adapter', () => {
    const adapter = getAdapter('opencode')
    expect(adapter.name).toBe('opencode')
  })

  it('returns codex adapter', () => {
    const adapter = getAdapter('codex')
    expect(adapter.name).toBe('codex')
  })

  it('throws on unknown adapter name', () => {
    expect(() => getAdapter('unknown')).toThrow()
  })
})
