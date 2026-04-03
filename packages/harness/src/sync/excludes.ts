import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * Rsync exclude rules for files that should never sync.
 * Database files, dependencies, VCS, binary/media, archives.
 */
export const EXCLUDE_RULES: string[] = [
  // Database files
  '*.db',
  '*.db-wal',
  '*.db-shm',
  '*.sqlite',
  '*.sqlite-wal',
  '*.sqlite-shm',
  // Dependencies and build
  'node_modules/',
  '.git/',
  'dist/',
  // Binary/media files
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.pdf',
  // Archives
  '*.zip',
  '*.tar.gz',
]

/** Include patterns for memory sync: markdown only */
export const MEMORY_INCLUDES: string[] = ['*/', '*.md']

/** Include patterns for planning sync: markdown + json */
export const PLANNING_INCLUDES: string[] = ['*/', '*.md', '*.json']

/**
 * Writes EXCLUDE_RULES to ~/.gstackapp/sync-exclude.txt.
 * Creates the directory if it doesn't exist.
 * @returns The absolute path to the exclude file.
 */
export function writeExcludeFile(): string {
  const dir = join(homedir(), '.gstackapp')
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, 'sync-exclude.txt')
  writeFileSync(filePath, EXCLUDE_RULES.join('\n') + '\n')
  return filePath
}
