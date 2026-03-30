import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { validatePath } from '../pipeline/sandbox'
import { executeTool } from '../pipeline/tools'

let tmpDir: string

beforeAll(() => {
  // Create a real temp directory with test files for sandbox testing
  // Use realpathSync to resolve macOS /var -> /private/var symlink
  tmpDir = realpathSync(mkdtempSync(join(tmpdir(), 'sandbox-test-')))
  writeFileSync(join(tmpDir, 'test.txt'), 'hello world')
  mkdirSync(join(tmpDir, 'subdir'))
  writeFileSync(join(tmpDir, 'subdir', 'nested.ts'), 'export const x = 1')
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('validatePath', () => {
  it('returns resolved path for a valid file inside clone', () => {
    const result = validatePath('test.txt', tmpDir)
    expect(result).toBe(join(tmpDir, 'test.txt'))
  })

  it('returns resolved path for nested file', () => {
    const result = validatePath('subdir/nested.ts', tmpDir)
    expect(result).toBe(join(tmpDir, 'subdir', 'nested.ts'))
  })

  it('throws "Access denied" for path traversal to real file outside sandbox', () => {
    // Create a file outside the sandbox to test actual path escape
    const outsideFile = join(tmpDir, '..', 'outside-sandbox.txt')
    writeFileSync(outsideFile, 'should not be readable')
    try {
      expect(() => validatePath('../outside-sandbox.txt', tmpDir)).toThrow(
        'Access denied: path escapes sandbox'
      )
    } finally {
      rmSync(outsideFile, { force: true })
    }
  })

  it('throws "File not found" for path traversal to nonexistent outside path', () => {
    // ../../../etc/passwd won't resolve on macOS -- gets "File not found" which also blocks access
    expect(() => validatePath('../../../etc/passwd', tmpDir)).toThrow(
      'File not found'
    )
  })

  it('throws "File not found" for nonexistent file', () => {
    expect(() => validatePath('nonexistent-file.ts', tmpDir)).toThrow(
      'File not found'
    )
  })

  it('returns the clone root itself for "."', () => {
    const result = validatePath('.', tmpDir)
    expect(result).toBe(tmpDir)
  })
})

describe('executeTool', () => {
  it('read_file returns file contents', async () => {
    const result = await executeTool('read_file', { path: 'test.txt' }, tmpDir)
    expect(result).toBe('hello world')
  })

  it('list_files returns formatted directory listing', async () => {
    const result = await executeTool('list_files', { path: '.' }, tmpDir)
    expect(result).toContain('[dir] subdir')
    expect(result).toContain('[file] test.txt')
  })

  it('search_code returns grep matches', async () => {
    const result = await executeTool(
      'search_code',
      { pattern: 'hello' },
      tmpDir
    )
    expect(result).toContain('hello world')
  })

  it('search_code returns "No matches found." for no matches', async () => {
    const result = await executeTool(
      'search_code',
      { pattern: 'zzz_nonexistent_pattern_zzz' },
      tmpDir
    )
    expect(result).toBe('No matches found.')
  })

  it('throws for unknown tool', async () => {
    await expect(executeTool('unknown_tool', {}, tmpDir)).rejects.toThrow(
      'Unknown tool: unknown_tool'
    )
  })
})
