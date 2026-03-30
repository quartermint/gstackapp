import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import type Anthropic from '@anthropic-ai/sdk'
import { validatePath } from './sandbox'

const MAX_FILE_SIZE = 100 * 1024 // 100KB
const MAX_TRUNCATED_CHARS = 10_000
const MAX_GREP_MATCHES = 50
const GREP_TIMEOUT_MS = 10_000

/**
 * Create Claude API tool definitions for sandboxed file access.
 * Three read-only tools: read_file, list_files, search_code.
 * No write tools -- AI can only observe, never modify.
 */
export function createSandboxTools(clonePath: string): Anthropic.Tool[] {
  return [
    {
      name: 'read_file',
      description:
        'Read the contents of a file from the repository. Returns the file text. Files larger than 100KB are truncated to the first 10,000 characters.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file from the repository root',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'list_files',
      description:
        'List files and directories at a given path in the repository. Returns entries prefixed with [dir] or [file].',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description:
              'Relative path to the directory from the repository root. Use "." for the root.',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'search_code',
      description:
        'Search for a pattern in the repository code using grep. Returns matching lines with file paths and line numbers. Limited to 50 matches.',
      input_schema: {
        type: 'object' as const,
        properties: {
          pattern: {
            type: 'string',
            description: 'The search pattern (grep basic regex)',
          },
          file_pattern: {
            type: 'string',
            description:
              'Optional glob pattern to filter files (e.g., "*.ts", "*.py")',
          },
        },
        required: ['pattern'],
      },
    },
  ]
}

/**
 * Execute a sandbox tool call and return the result as a string.
 *
 * SECURITY: All file access goes through validatePath() which uses
 * realpathSync to prevent symlink escape. grep uses execFileSync
 * (not execSync) to prevent shell injection from AI-generated patterns.
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  clonePath: string
): Promise<string> {
  switch (toolName) {
    case 'read_file': {
      const filePath = input.path as string
      const validatedPath = validatePath(filePath, clonePath)
      let content = readFileSync(validatedPath, 'utf-8')
      if (content.length > MAX_FILE_SIZE) {
        content =
          `[TRUNCATED: file exceeds 100KB, showing first ${MAX_TRUNCATED_CHARS} characters]\n\n` +
          content.slice(0, MAX_TRUNCATED_CHARS)
      }
      return content
    }

    case 'list_files': {
      const dirPath = (input.path as string) || '.'
      const validatedDir = validatePath(dirPath, clonePath)
      const entries = readdirSync(validatedDir, { withFileTypes: true })
      return entries
        .map((entry) => {
          const prefix = entry.isDirectory() ? '[dir]' : '[file]'
          return `${prefix} ${entry.name}`
        })
        .join('\n')
    }

    case 'search_code': {
      const pattern = input.pattern as string
      const filePattern = input.file_pattern as string | undefined
      const args = ['-rn', '-m', String(MAX_GREP_MATCHES)]
      if (filePattern) {
        args.push(`--include=${filePattern}`)
      }
      args.push('--', pattern, '.')
      try {
        return execFileSync('grep', args, {
          cwd: clonePath,
          encoding: 'utf-8',
          timeout: GREP_TIMEOUT_MS,
        })
      } catch {
        // grep returns exit code 1 when no matches found
        return 'No matches found.'
      }
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}
