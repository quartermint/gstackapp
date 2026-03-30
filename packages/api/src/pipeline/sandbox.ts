import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Validate that a requested file path resolves to a location within the sandbox root.
 *
 * Security pattern (CVE-2025-53109 prevention):
 * 1. resolve() the candidate path from sandboxRoot + requestedPath
 * 2. realpathSync() FIRST to resolve any symlinks to their true target
 * 3. THEN check that the resolved real path starts with the real sandbox root
 *
 * @param requestedPath - The path requested by the AI (may be relative)
 * @param sandboxRoot - The root directory of the cloned repo
 * @returns The validated real path
 * @throws Error if file not found or path escapes sandbox
 */
export function validatePath(requestedPath: string, sandboxRoot: string): string {
  const candidatePath = resolve(sandboxRoot, requestedPath)
  let realPath: string
  try {
    realPath = realpathSync(candidatePath)
  } catch {
    throw new Error(`File not found: ${requestedPath}`)
  }
  const realRoot = realpathSync(sandboxRoot)
  if (!realPath.startsWith(realRoot + '/') && realPath !== realRoot) {
    throw new Error('Access denied: path escapes sandbox')
  }
  return realPath
}
