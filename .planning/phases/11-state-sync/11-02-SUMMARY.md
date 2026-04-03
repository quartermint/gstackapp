---
phase: 11-state-sync
plan: 02
subsystem: sync
tags: [cli, sync-command, bidirectional, tailscale]

requires:
  - "11-01: Sync infrastructure (rsync.ts, lock.ts, excludes.ts, paths.ts)"
provides:
  - "CLI sync command (harness sync push/pull/bidirectional)"
  - "Bidirectional sync with lock file protection"
  - "--dry-run and --target CLI flags"

key-files:
  created:
    - packages/harness/src/sync/sync-command.ts
    - packages/harness/src/__tests__/sync-command.test.ts
  modified:
    - packages/harness/src/sync/index.ts
    - packages/harness/src/cli.ts

commits:
  - hash: 972f465
    message: "test(11-02): add failing tests for sync command handler"
  - hash: 625c215
    message: "feat(11-02): implement sync command handler with CLI wiring"

self-check: PASSED
---

# Plan 11-02 Summary

## What was built

Sync command handler and CLI wiring for `harness sync [push|pull]` with bidirectional support. Push-then-pull approach with `--update` for newer-wins semantics. Lock file wraps entire sync operation. `--dry-run` and `--target` flags exposed through CLI.

## Key decisions

- Bidirectional = sequential push then pull (per D-01)
- Lock acquired before any rsync call, released after all complete
- CLI routing uses same process.argv pattern as existing commands

## Deviations

None.

## Checkpoint

Task 2 (human-verify: Tailscale sync) was auto-approved in autonomous mode. Manual verification deferred to post-milestone.

## Test results

177 harness tests passing (including sync-command tests).
