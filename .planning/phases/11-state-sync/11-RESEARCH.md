# Phase 11: State Sync - Research

**Researched:** 2026-04-03
**Domain:** rsync-over-Tailscale file sync, CLI subcommand integration, lock file concurrency
**Confidence:** HIGH

## Summary

Phase 11 adds a `sync` subcommand to the existing `@gstackapp/harness` CLI that shells out to rsync over SSH/Tailscale to synchronize memory markdown files and GSD `.planning/` state between the laptop and Mac Mini. The implementation is straightforward: Node.js `child_process.execFileSync` wrapping rsync with carefully constructed include/exclude rules, a JSON lock file with stale-PID detection, and integration into the existing CLI argument parser.

The core risk is not technical complexity (rsync is battle-tested) but getting the include/exclude rules right so only `.md` and `.json` files sync while everything else is excluded. macOS ships with `openrsync` (protocol version 29, rsync 2.6.9 compatible), which supports all required flags. SSH over Tailscale requires zero additional config -- `ssh ryans-mac-mini` already works.

**Primary recommendation:** Shell out directly to rsync via `child_process.execFileSync` -- no wrapper library needed. The command construction is simple enough that a library would add dependency weight without value.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Bidirectional sync, both devices equal peers, `--update` (newer wins)
- D-02: Sync paths -- Memory: `~/.claude/projects/*/memory/*.md`; GSD: `.planning/` dirs with `*.md`, `*.json`
- D-03: Sync target identified by Tailscale hostname, not IP
- D-04: Manual CLI command only (`harness sync`), no cron/watch in v1.1
- D-05: Subcommands: `sync push`, `sync pull`, `sync` (bidirectional default), `--dry-run` flag
- D-06: Target configurable via `SYNC_TARGET` env var (default: `ryans-mac-mini`) or `--target` flag
- D-07: Lock file at `~/.gstackapp/sync.lock`, stale lock detection via PID check
- D-08: If PID alive, exit non-zero with warning. If PID dead, remove stale lock and proceed with warning
- D-09: Lock file JSON: `{ pid, hostname, startedAt, paths }`
- D-10: Rsync exclude rules for DB files, node_modules, .git, images, archives
- D-11: Allowlist approach for `.planning/` -- only `.md` and `.json` files
- D-12: Rsync flags: `--archive --update --compress --exclude-from=<file> --itemize-changes`
- D-13: Last-write-wins via `--update`, acceptable for single-user two-device scenario
- D-14: No conflict preservation -- git is the recovery mechanism

### Claude's Discretion
- Whether to shell out to rsync directly or use a Node.js rsync wrapper library
- Sync progress output format (verbose vs summary)
- Whether to add a `sync status` command

### Deferred Ideas (OUT OF SCOPE)
- Automatic sync on session start/end
- Sync conflict resolution UI
- Sync history/audit log
- Multi-device sync (beyond 2 devices)
- CRDT-based real-time sync
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-01 | Rsync transport syncs memory markdown files between laptop and Mac Mini over Tailscale | rsync with `--include='*.md' --exclude='*'` over `ssh ryans-mac-mini`, bidirectional via two rsync calls with `--update` |
| SYNC-02 | Rsync transport syncs .planning/ GSD state directories between devices | Same rsync approach with `--include='*.md' --include='*.json' --exclude='*'`, applied to project `.planning/` dirs |
| SYNC-03 | Lock file mechanism prevents concurrent writes during active sync | JSON lock file at `~/.gstackapp/sync.lock` with PID, hostname, timestamp; stale detection via `process.kill(pid, 0)` |
| SYNC-04 | Sync explicitly excludes SQLite databases and binary files | Allowlist approach (include only `.md`/`.json`, exclude everything else) plus explicit exclude-from file for safety |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| rsync (system) | openrsync 2.6.9-compat | File sync transport | Pre-installed on macOS, battle-tested, exactly designed for this use case |
| ssh (system) | OpenSSH 10.2p1 | Transport layer | Pre-installed, Tailscale integration works transparently |
| node:child_process | Node 22 built-in | Shell out to rsync | `execFileSync` for synchronous execution, `execFile` for streaming output |
| node:fs | Node 22 built-in | Lock file management | `writeFileSync`, `readFileSync`, `unlinkSync`, `mkdirSync` |
| node:os | Node 22 built-in | Hostname for lock file | `os.hostname()` for lock file metadata |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino | ^9.6.0 | Structured logging | Already a harness dependency -- use for sync event logging |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct rsync shell-out | rsync npm package (node-rsync) | node-rsync is a thin wrapper around the CLI anyway, last published 2019, 88 weekly downloads. Direct shell-out is simpler and avoids a stale dependency. **Recommendation: shell out directly.** |
| Direct rsync shell-out | rsync2 npm package | 12 weekly downloads, unmaintained. Same verdict. |

## Architecture Patterns

### Recommended Project Structure
```
packages/harness/src/
├── sync/
│   ├── index.ts          # Public exports
│   ├── sync-command.ts   # CLI handler for sync subcommand
│   ├── rsync.ts          # rsync command builder and executor
│   ├── lock.ts           # Lock file acquire/release/stale detection
│   ├── paths.ts          # Sync path resolution and config
│   └── excludes.ts       # Exclude/include rule generation
├── cli.ts                # Existing -- add sync routing
└── ...
```

### Pattern 1: Rsync Command Builder
**What:** Build rsync argument arrays programmatically, then execute via `execFileSync`/`execFile`.
**When to use:** Every sync operation.
**Example:**
```typescript
import { execFileSync } from 'node:child_process';

interface RsyncOptions {
  source: string;
  destination: string;
  includePatterns: string[];
  excludeFromFile: string;
  dryRun: boolean;
  direction: 'push' | 'pull';
}

function buildRsyncArgs(opts: RsyncOptions): string[] {
  const args: string[] = [
    '--archive',
    '--update',
    '--compress',
    '--itemize-changes',
  ];

  // Include patterns (order matters: includes before excludes)
  for (const pattern of opts.includePatterns) {
    args.push('--include', pattern);
  }

  // Exclude everything not included
  args.push('--exclude-from', opts.excludeFromFile);
  args.push('--exclude', '*');

  if (opts.dryRun) {
    args.push('--dry-run');
  }

  // Source and destination (trailing slash matters for rsync)
  args.push(opts.source, opts.destination);

  return args;
}

function executeRsync(args: string[]): string {
  const result = execFileSync('rsync', args, {
    encoding: 'utf-8',
    timeout: 60_000, // 60s timeout
  });
  return result;
}
```

### Pattern 2: Lock File with Stale Detection
**What:** JSON lock file with PID-based stale detection.
**When to use:** Before any sync operation begins.
**Example:**
```typescript
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname } from 'node:path';

interface LockData {
  pid: number;
  hostname: string;
  startedAt: string;
  paths: string[];
}

const LOCK_PATH = `${process.env.HOME}/.gstackapp/sync.lock`;

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 = check existence
    return true;
  } catch {
    return false;
  }
}

function acquireLock(paths: string[]): void {
  try {
    const existing = JSON.parse(readFileSync(LOCK_PATH, 'utf-8')) as LockData;
    if (isPidAlive(existing.pid)) {
      console.error(
        `Sync already in progress (PID ${existing.pid} on ${existing.hostname}, started ${existing.startedAt})`
      );
      process.exit(1);
    }
    // Stale lock -- remove and proceed
    console.warn(`Removing stale lock (PID ${existing.pid} is dead)`);
    unlinkSync(LOCK_PATH);
  } catch {
    // No lock file or unreadable -- proceed
  }

  mkdirSync(dirname(LOCK_PATH), { recursive: true });
  const lock: LockData = {
    pid: process.pid,
    hostname: hostname(),
    startedAt: new Date().toISOString(),
    paths,
  };
  writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2));
}

function releaseLock(): void {
  try { unlinkSync(LOCK_PATH); } catch { /* already gone */ }
}
```

### Pattern 3: CLI Subcommand Integration
**What:** Add `sync` as a new top-level command in the existing CLI arg parser.
**When to use:** Extending cli.ts.
**Example:**
```typescript
// In cli.ts main() function, add before the unknown command handler:
if (command === 'sync') {
  const subcommand = args[1]; // push, pull, or undefined (bidirectional)
  const dryRun = args.includes('--dry-run');
  const targetFlag = args.find(f => f.startsWith('--target='));
  const target = targetFlag?.split('=')[1] ?? process.env.SYNC_TARGET ?? 'ryans-mac-mini';

  await syncCommand({ direction: subcommand as 'push' | 'pull' | undefined, dryRun, target });
  return;
}
```

### Pattern 4: Bidirectional Sync via Two rsync Calls
**What:** Bidirectional sync is implemented as push-then-pull (two sequential rsync invocations), both with `--update`.
**When to use:** Default `harness sync` (no subcommand).
**Why:** rsync is inherently unidirectional. Bidirectional requires two passes. `--update` on both ensures newer-wins semantics without conflicts.
```typescript
async function bidirectionalSync(paths: SyncPaths, target: string, dryRun: boolean): Promise<void> {
  // Push first (local -> remote), then pull (remote -> local)
  // Order doesn't matter with --update, but push-first is convention
  await pushSync(paths, target, dryRun);
  await pullSync(paths, target, dryRun);
}
```

### Anti-Patterns to Avoid
- **Building rsync args as a string:** Use array form with `execFileSync('rsync', argsArray)` to avoid shell injection and quoting issues.
- **Forgetting trailing slash in rsync paths:** `src/` syncs contents, `src` syncs the directory itself. For `.planning/`, use trailing slash to sync contents into the matching remote directory.
- **Exclude before include:** rsync processes rules in order. Include patterns MUST come before the final `--exclude '*'` catch-all, otherwise nothing gets through.
- **Using `execSync` instead of `execFileSync`:** `execSync` runs through a shell (injection risk). `execFileSync` runs the binary directly.
- **Not handling SIGINT/SIGTERM:** If the process is killed mid-sync, the lock file remains. Use `process.on('SIGINT', releaseLock)` and `process.on('SIGTERM', releaseLock)` as cleanup handlers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File synchronization | Custom diff/copy logic | rsync | rsync handles partial transfers, permission preservation, compression, incremental updates. Decades of edge case handling. |
| SSH transport | Custom TCP/auth | ssh (via rsync -e ssh) | rsync uses ssh as transport by default on macOS. Zero config needed. |
| PID existence check | Shell out to `ps` or `kill` | `process.kill(pid, 0)` | Node.js built-in. Signal 0 checks process existence without sending an actual signal. Cross-platform. |

## Common Pitfalls

### Pitfall 1: macOS openrsync vs GNU rsync Flag Differences
**What goes wrong:** Some GNU rsync flags don't exist in macOS's openrsync (e.g., `--info=progress2` for progress display).
**Why it happens:** macOS ships openrsync, which is a clean-room implementation compatible with rsync protocol 29 but not feature-identical with GNU rsync 3.x.
**How to avoid:** Stick to the flags confirmed available: `--archive`, `--update`, `--compress`, `--exclude`, `--exclude-from`, `--include`, `--include-from`, `--itemize-changes`, `--dry-run`. These all work on both openrsync and GNU rsync.
**Warning signs:** `rsync: --some-flag: unknown option` error.

### Pitfall 2: Glob Expansion in Memory Paths
**What goes wrong:** `~/.claude/projects/*/memory/` contains a glob. If passed to rsync as a string, the shell expands it. If passed via `execFileSync` (no shell), it won't expand.
**Why it happens:** `execFileSync` bypasses the shell by design.
**How to avoid:** Resolve globs in Node.js first using `node:fs` + `node:path` (e.g., `readdirSync` on `~/.claude/projects/`) and pass each resolved path to rsync individually. Or use `glob` from Node 22's built-in `node:fs`.
**Warning signs:** rsync reports "No such file or directory" for the literal `*` path.

### Pitfall 3: Lock File Not Cleaned on Crash
**What goes wrong:** If the process crashes (uncaught exception, SIGKILL), the lock file persists.
**Why it happens:** Signal handlers for SIGINT/SIGTERM work, but SIGKILL cannot be caught.
**How to avoid:** The stale-PID detection (D-08) handles this -- if the PID in the lock file is dead, remove the lock and proceed. This is the correct design already specified in CONTEXT.md.
**Warning signs:** "Sync already in progress" when no sync is running.

### Pitfall 4: rsync Include/Exclude Order
**What goes wrong:** Files that should sync don't sync, or files that shouldn't sync do.
**Why it happens:** rsync processes filter rules in order. The first matching rule wins. If `--exclude '*'` appears before `--include '*.md'`, nothing matches.
**How to avoid:** Always specify includes first, then excludes. For the allowlist approach:
```
--include='*/'          # Include directories (needed to traverse)
--include='*.md'
--include='*.json'
--exclude='*'           # Exclude everything else
```
The `--include='*/'` is critical -- without it, rsync won't descend into subdirectories.

### Pitfall 5: Remote Path Doesn't Exist
**What goes wrong:** First sync to a new device fails because the remote directory doesn't exist.
**Why it happens:** rsync can create the final directory but not intermediate parents by default.
**How to avoid:** Use `--rsync-path='mkdir -p /path/to/remote && rsync'` or pre-create directories via ssh before first sync. Simpler: just run `ssh target 'mkdir -p ~/.claude/projects'` as a pre-flight check.

## Code Examples

### Complete Rsync Command for Memory Sync (Push)
```typescript
// Push memory files: laptop -> Mac Mini
const args = [
  '--archive',
  '--update',
  '--compress',
  '--itemize-changes',
  '--include', '*/',       // traverse directories
  '--include', '*.md',     // memory files
  '--exclude', '*',        // nothing else
  `${homeDir}/.claude/projects/`,
  `${target}:${homeDir}/.claude/projects/`,
];

if (dryRun) args.splice(4, 0, '--dry-run');

execFileSync('rsync', args, { encoding: 'utf-8', stdio: 'inherit' });
```

### Complete Rsync Command for Planning Sync (Push)
```typescript
// Push .planning/ files: laptop -> Mac Mini
const args = [
  '--archive',
  '--update',
  '--compress',
  '--itemize-changes',
  '--include', '*/',       // traverse directories
  '--include', '*.md',     // planning docs
  '--include', '*.json',   // config, state
  '--exclude', '*',        // nothing else (no .db, no node_modules, no images)
  `${projectRoot}/.planning/`,
  `${target}:${remoteProjectRoot}/.planning/`,
];
```

### Exclude File Contents (for explicit safety)
```
# ~/.gstackapp/sync-exclude.txt
# Database files
*.db
*.db-wal
*.db-shm
*.sqlite
*.sqlite-wal
*.sqlite-shm

# Dependencies and build
node_modules/
.git/
dist/

# Binary/media files
*.png
*.jpg
*.jpeg
*.gif
*.pdf
*.zip
*.tar.gz
```

### Signal Handler for Lock Cleanup
```typescript
function withLock<T>(paths: string[], fn: () => T): T {
  acquireLock(paths);
  const cleanup = () => releaseLock();
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  try {
    return fn();
  } finally {
    cleanup();
    process.removeListener('SIGINT', cleanup);
    process.removeListener('SIGTERM', cleanup);
  }
}
```

### Sync Status Command (Discretion: Recommended)
```typescript
// Simple sync status showing last sync time from lock file modification time
// and quick rsync --dry-run to show pending changes
function syncStatus(target: string): void {
  // Check if target is reachable
  try {
    execFileSync('ssh', ['-o', 'ConnectTimeout=3', target, 'true'], { encoding: 'utf-8' });
    console.log(`Target: ${target} [reachable]`);
  } catch {
    console.log(`Target: ${target} [unreachable]`);
    return;
  }

  // Run dry-run to show what would sync
  console.log('\nPending changes (dry-run):');
  // ... run rsync --dry-run and parse itemized output
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Syncthing/Unison | rsync for CLI tools | Always | rsync is simpler for manual-trigger, two-device sync. Syncthing/Unison add daemons and complexity for continuous sync which is explicitly out of scope. |
| GNU rsync on macOS | openrsync (macOS 13+) | macOS 13+ | macOS replaced GNU rsync with openrsync. Feature-compatible for common flags. Some advanced GNU flags missing but none needed here. |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1 |
| Config file | `packages/harness/vitest.config.ts` |
| Quick run command | `cd packages/harness && npx vitest run src/__tests__/sync*.test.ts` |
| Full suite command | `cd packages/harness && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | Memory markdown files sync via rsync | unit | `npx vitest run src/__tests__/sync-rsync.test.ts -t "memory"` | Wave 0 |
| SYNC-02 | .planning/ GSD state sync via rsync | unit | `npx vitest run src/__tests__/sync-rsync.test.ts -t "planning"` | Wave 0 |
| SYNC-03 | Lock file prevents concurrent writes | unit | `npx vitest run src/__tests__/sync-lock.test.ts` | Wave 0 |
| SYNC-04 | Excludes SQLite and binary files | unit | `npx vitest run src/__tests__/sync-excludes.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/harness && npx vitest run src/__tests__/sync*.test.ts`
- **Per wave merge:** `cd packages/harness && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/sync-rsync.test.ts` -- tests rsync arg builder output (unit, no actual rsync calls)
- [ ] `src/__tests__/sync-lock.test.ts` -- tests lock acquire/release/stale detection
- [ ] `src/__tests__/sync-excludes.test.ts` -- tests exclude/include rule generation, verifies SYNC-04

### Testing Strategy Notes
Tests should validate rsync **argument construction** (unit tests), not actual rsync execution (which requires SSH connectivity). Mock `execFileSync` to verify the correct args are built. Lock file tests can use real filesystem operations in a temp directory.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| rsync | SYNC-01, SYNC-02 | Yes | openrsync (protocol 29, rsync 2.6.9 compat) | -- |
| ssh | SYNC-01, SYNC-02 | Yes | OpenSSH 10.2p1 | -- |
| Tailscale | SYNC-01 (hostname routing) | Yes (assumed, per CLAUDE.md) | -- | Use IP address directly |
| Node.js | All | Yes | 22 LTS | -- |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Open Questions

1. **Remote project paths**
   - What we know: Local paths are `~/.claude/projects/*/memory/` and `.planning/` in project roots
   - What's unclear: Do the same project paths exist on the Mac Mini? Is `gstackapp` at the same filesystem path on both machines?
   - Recommendation: The sync config should map local paths to remote paths. Default to same-path assumption, allow override via env vars `SYNC_MEMORY_PATHS` and `SYNC_PLANNING_PATHS`.

2. **First-run directory creation**
   - What we know: rsync needs the parent directory to exist on the remote
   - What's unclear: Whether `.claude/projects/` structure exists on Mac Mini
   - Recommendation: Add a pre-flight `ssh target 'mkdir -p <paths>'` step on first sync, or use `--rsync-path` hack.

## Sources

### Primary (HIGH confidence)
- macOS openrsync help output -- verified flag availability for `--archive`, `--update`, `--compress`, `--exclude-from`, `--include`, `--itemize-changes`, `--dry-run`
- Node.js `child_process.execFileSync` -- built-in, well-documented
- Existing harness CLI (`packages/harness/src/cli.ts`) -- verified command routing pattern
- Existing harness test patterns (`packages/harness/src/__tests__/cli.test.ts`) -- verified test approach

### Secondary (MEDIUM confidence)
- rsync include/exclude ordering semantics -- well-documented in rsync manpage, confirmed via openrsync help flags

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools are system-installed or Node.js built-ins, zero new dependencies needed
- Architecture: HIGH -- CLI integration pattern is directly observable from existing code, rsync argument construction is well-understood
- Pitfalls: HIGH -- rsync pitfalls are well-documented and the openrsync flag compatibility was directly verified

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable domain, rsync and SSH don't change often)
