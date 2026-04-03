import { execFileSync } from 'node:child_process'
import { resolveSyncPaths } from './paths'
import { writeExcludeFile, MEMORY_INCLUDES, PLANNING_INCLUDES } from './excludes'
import { buildRsyncArgs, executeRsync } from './rsync'
import { withLock } from './lock'

export interface SyncCommandOptions {
  direction?: 'push' | 'pull'
  dryRun: boolean
  target: string
}

/**
 * Execute sync command: push, pull, or bidirectional (push then pull).
 *
 * Pre-flight checks verify SSH connectivity and create remote directories.
 * All rsync operations are wrapped in a lock file to prevent concurrent syncs.
 */
export async function syncCommand(opts: SyncCommandOptions): Promise<void> {
  const syncPaths = resolveSyncPaths(opts.target)
  const excludeFile = writeExcludeFile()

  // All paths that will be synced
  const allLocalPaths = [...syncPaths.memoryPaths, ...syncPaths.planningPaths]

  // Pre-flight: check SSH connectivity
  try {
    execFileSync('ssh', [
      '-o', 'ConnectTimeout=5',
      '-o', 'BatchMode=yes',
      syncPaths.target,
      'true',
    ], { encoding: 'utf-8', timeout: 10_000 })
  } catch {
    console.error(`Cannot reach ${syncPaths.target}. Is Tailscale connected?`)
    process.exit(1)
  }

  // Pre-flight: ensure remote directories exist
  const remotePaths = allLocalPaths.map((p) => p.replace(/\/$/, ''))
  try {
    execFileSync('ssh', [
      syncPaths.target,
      'mkdir', '-p',
      ...remotePaths,
    ], { encoding: 'utf-8', timeout: 10_000 })
  } catch (err) {
    console.error(`Failed to create remote directories: ${(err as Error).message}`)
    process.exit(1)
  }

  // Sync with lock protection
  withLock(allLocalPaths, () => {
    const direction = opts.direction

    if (direction === 'push' || direction === undefined) {
      syncDirection('push', syncPaths.memoryPaths, syncPaths.planningPaths, syncPaths.target, excludeFile, opts.dryRun)
    }

    if (direction === 'pull' || direction === undefined) {
      syncDirection('pull', syncPaths.memoryPaths, syncPaths.planningPaths, syncPaths.target, excludeFile, opts.dryRun)
    }
  })

  console.log('Sync complete.')
}

function syncDirection(
  direction: 'push' | 'pull',
  memoryPaths: string[],
  planningPaths: string[],
  target: string,
  excludeFile: string,
  dryRun: boolean,
): void {
  // Memory paths
  for (const memPath of memoryPaths) {
    const localPath = memPath.endsWith('/') ? memPath : memPath + '/'
    const remotePath = `${target}:${localPath}`

    const source = direction === 'push' ? localPath : remotePath
    const destination = direction === 'push' ? remotePath : localPath

    console.log(`[sync] ${direction} ${source} -> ${destination}`)

    const args = buildRsyncArgs({
      source,
      destination,
      includes: MEMORY_INCLUDES,
      excludeFile,
      dryRun,
    })
    executeRsync(args)
  }

  // Planning paths
  for (const planPath of planningPaths) {
    const localPath = planPath.endsWith('/') ? planPath : planPath + '/'
    const remotePath = `${target}:${localPath}`

    const source = direction === 'push' ? localPath : remotePath
    const destination = direction === 'push' ? remotePath : localPath

    console.log(`[sync] ${direction} ${source} -> ${destination}`)

    const args = buildRsyncArgs({
      source,
      destination,
      includes: PLANNING_INCLUDES,
      excludeFile,
      dryRun,
    })
    executeRsync(args)
  }
}
