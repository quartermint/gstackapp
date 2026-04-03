import { execFileSync } from 'node:child_process'

export interface RsyncOptions {
  source: string
  destination: string
  includes: string[]
  excludeFile: string
  dryRun: boolean
}

/**
 * Build rsync argument array from options.
 *
 * Include rules come before excludes (rsync processes rules in order).
 * Source and destination are always the last two elements.
 */
export function buildRsyncArgs(opts: RsyncOptions): string[] {
  const args: string[] = [
    '--archive',
    '--update',
    '--compress',
    '--itemize-changes',
  ]

  if (opts.dryRun) {
    args.push('--dry-run')
  }

  // Include patterns (must come before excludes)
  for (const pattern of opts.includes) {
    args.push('--include', pattern)
  }

  // Exclude-from file for explicit safety rules
  args.push('--exclude-from', opts.excludeFile)

  // Catch-all exclude
  args.push('--exclude', '*')

  // Source and destination are always last
  args.push(opts.source, opts.destination)

  return args
}

/**
 * Execute rsync with the given argument array.
 * Uses execFileSync (no shell) to avoid injection risks.
 */
export function executeRsync(args: string[]): string {
  return execFileSync('rsync', args, {
    encoding: 'utf-8',
    timeout: 120_000,
  })
}
