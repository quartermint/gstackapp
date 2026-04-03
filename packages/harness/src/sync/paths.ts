import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface SyncPaths {
  target: string
  memoryPaths: string[]
  planningPaths: string[]
}

/**
 * Resolve sync paths from env vars and defaults.
 *
 * - Target: targetOverride > SYNC_TARGET env > 'ryans-mac-mini'
 * - Memory paths: SYNC_MEMORY_PATHS env (colon-separated) or auto-discover ~/.claude/projects/{project}/memory/
 * - Planning paths: SYNC_PLANNING_PATHS env (colon-separated) or empty array
 */
export function resolveSyncPaths(targetOverride?: string): SyncPaths {
  const target = targetOverride ?? process.env.SYNC_TARGET ?? 'ryans-mac-mini'

  // Memory paths
  let memoryPaths: string[]
  if (process.env.SYNC_MEMORY_PATHS) {
    memoryPaths = process.env.SYNC_MEMORY_PATHS.split(':').filter(Boolean)
  } else {
    memoryPaths = discoverMemoryPaths()
  }

  // Planning paths
  let planningPaths: string[]
  if (process.env.SYNC_PLANNING_PATHS) {
    planningPaths = process.env.SYNC_PLANNING_PATHS.split(':').filter(Boolean)
  } else {
    planningPaths = []
  }

  return { target, memoryPaths, planningPaths }
}

/**
 * Auto-discover memory directories at ~/.claude/projects/{project}/memory/
 * Uses node:fs since execFileSync bypasses shell glob expansion.
 */
function discoverMemoryPaths(): string[] {
  const projectsDir = join(homedir(), '.claude', 'projects')
  try {
    const entries = readdirSync(projectsDir)
    const paths: string[] = []
    for (const entry of entries) {
      const memoryDir = join(projectsDir, entry, 'memory')
      try {
        const stat = statSync(memoryDir)
        if (stat.isDirectory()) {
          paths.push(memoryDir + '/')
        }
      } catch {
        // memory/ doesn't exist for this project, skip
      }
    }
    return paths
  } catch {
    // ~/.claude/projects/ doesn't exist
    return []
  }
}
