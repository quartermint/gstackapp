# Phase 11: State Sync - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Rsync-over-Tailscale sync for memory markdown files and GSD `.planning/` state between laptop and Mac Mini. Lock file conflict guard. Explicit exclusion of binary/database files.

</domain>

<decisions>
## Implementation Decisions

### Sync Direction (SYNC-01, SYNC-02)
- **D-01:** Bidirectional sync — both devices are equal peers. No designated "source of truth." Rsync with `--update` flag (newer file wins) handles the common case of editing on one device at a time
- **D-02:** Sync paths are configurable, defaults:
  - Memory: `~/.claude/projects/*/memory/` → syncs `*.md` files
  - GSD state: `.planning/` directories in configured project roots → syncs `*.md`, `*.json` files
- **D-03:** Sync target is identified by Tailscale hostname (e.g., `ryans-mac-mini`), not IP address — survives IP changes

### Sync Trigger (SYNC-01)
- **D-04:** Manual CLI command: `npx @gstackapp/harness sync` (or `harness sync` if globally installed). No cron, no filesystem watch in v1.1 — sync is intentional, not automatic
- **D-05:** CLI subcommands: `sync push` (local → remote), `sync pull` (remote → local), `sync` (bidirectional, default). `--dry-run` flag shows what would change without doing it
- **D-06:** Sync target configurable via env var `SYNC_TARGET` (default: `ryans-mac-mini`) or CLI flag `--target`

### Lock File (SYNC-03)
- **D-07:** Lock file at `~/.gstackapp/sync.lock` on both devices. Created at sync start, removed on completion (or crash — stale lock detection via PID check)
- **D-08:** If lock file exists and the PID is still alive, second sync attempt prints a warning and exits non-zero. If PID is dead (stale lock), remove lock and proceed with a warning
- **D-09:** Lock file contains: `{ pid, hostname, startedAt, paths }` as JSON — enough to diagnose conflicts

### Exclusions (SYNC-04)
- **D-10:** Rsync exclude rules: `*.db`, `*.db-wal`, `*.db-shm`, `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`, `node_modules/`, `.git/`, `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.pdf`, `*.zip`, `*.tar.gz`
- **D-11:** Only sync markdown (`.md`) and JSON (`.json`) files from `.planning/` directories. Everything else is excluded by default (allowlist approach, not blocklist)
- **D-12:** Rsync flags: `--archive --update --compress --exclude-from=<exclusion_file> --itemize-changes` — archive preserves permissions/timestamps, update means newer wins, compress for efficiency over Tailscale, itemize-changes for logging

### Conflict Handling
- **D-13:** Beyond the lock file (which prevents concurrent syncs), conflict handling is simple: `--update` means last-write-wins based on file modification time. This is acceptable for single-user sync between two personal devices
- **D-14:** If a conflict is detected (file modified on both sides since last sync), rsync's `--update` picks the newer file. The older version is NOT preserved — this is intentional simplicity for v1.1. Users can use git to recover if needed (memory and planning files are in git repos)

### Claude's Discretion
- Whether to shell out to rsync directly or use a Node.js rsync wrapper library
- Sync progress output format (verbose vs summary)
- Whether to add a `sync status` command showing last sync time and pending changes

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Harness Package (from Phase 8)
- `packages/harness/` — CLI entry point where `sync` subcommand will be added

### Requirements
- `.planning/REQUIREMENTS.md` §State Sync — SYNC-01 through SYNC-04

### Infrastructure
- Mac Mini accessible via Tailscale at hostname `ryans-mac-mini` (documented in root CLAUDE.md)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Harness CLI from Phase 8 — `sync` is added as another subcommand
- Config resolution from Phase 7/8 — sync target and paths use the same env var pattern

### Established Patterns
- CLI commands in harness follow `process.argv` parsing (no framework, per Phase 8 D-09)
- Structured logging via pino for sync events

### Integration Points
- CLI entry point in `packages/harness/bin/harness` — adds `sync` command
- Config needs new env vars: `SYNC_TARGET`, `SYNC_MEMORY_PATHS`, `SYNC_PLANNING_PATHS`

</code_context>

<specifics>
## Specific Ideas

- Sync should work immediately after `npm install` + setting `SYNC_TARGET` — zero other setup required (rsync and ssh are pre-installed on macOS)
- The `--dry-run` flag is critical for trust — users should always be able to preview what sync will do before it does it

</specifics>

<deferred>
## Deferred Ideas

- Automatic sync on session start/end (hook into GSD session lifecycle) — future phase
- Sync conflict resolution UI showing diffs — v2
- Sync history/audit log — v2
- Multi-device sync (beyond 2 devices) — v2
- CRDT-based real-time sync — explicitly out of scope per PROJECT.md

</deferred>

---

*Phase: 11-state-sync*
*Context gathered: 2026-04-03*
