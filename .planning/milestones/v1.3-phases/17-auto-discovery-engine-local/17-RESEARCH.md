# Phase 17: Auto-Discovery Engine (Local) — Research

**Researched:** 2026-03-16
**Status:** Complete

## Domain Analysis

Phase 17 builds a local filesystem discovery service that finds git repos on the MacBook not already in mc.config.json. Users can promote (track) or permanently dismiss discovered repos. Discovery runs on its own independent timer (hourly), completely separate from the 5-minute project scan cycle.

### Requirements Coverage

| ID | Requirement | Implementation Approach |
|----|-------------|------------------------|
| DISC-01 | Depth-1 filesystem walk of configured root dirs | `fs.opendir()` on each path in `config.discovery.paths`, filter `.git` children |
| DISC-03 | Promote discovered repo to tracked project | PATCH /discoveries/:id with status="tracked", atomic mc.config.json write, insert projects table, trigger single-project scan |
| DISC-04 | Dismiss discovered repo permanently | PATCH /discoveries/:id with status="dismissed", never re-surface |
| DISC-09 | Own independent scan timer | New `startDiscoveryScanner()` in index.ts with configurable interval from `config.discovery.scanIntervalMinutes` |
| DISC-10 | SSE events for discovery:found and discovery:promoted | Extend MCEventType union in event-bus.ts, emit from service |

## Codebase Analysis

### Existing Patterns to Follow

**Service pattern** (from `project-scanner.ts`):
- Services export functions that take `DrizzleDb` as parameter
- `execFile` for git commands with configurable timeout
- `p-limit` for concurrency control
- Background poll via `setInterval`, returns timer handle for cleanup

**Timer registration** (from `index.ts`):
- Each timer declared at module level: `let discoveryTimer: ReturnType<typeof setInterval> | null = null`
- Started in config block after database init
- Cleaned up in `shutdown()` function

**Route pattern** (from `projects.ts`):
- Factory function: `createDiscoveryRoutes(getInstance, getConfig?)`
- Returns `new Hono()` chain with typed validators
- Registered in `app.ts` via `.route("/api", createDiscoveryRoutes(...))`
- Zod validators via `@hono/zod-validator`

**Query module pattern** (from `db/queries/projects.ts`):
- Functions take `DrizzleDb` and data objects
- `upsertProject` pattern: insert with `.onConflictDoUpdate()`
- `listProjects` pattern: optional query filters with `eq()` conditions
- `getProject` pattern: `.get()` with `notFound()` throw

**Event bus pattern** (from `event-bus.ts`):
- `MCEventType` union for typed events
- `MCEvent` interface with `type`, `id`, `data?`
- `eventBus.emit("mc:event", { type, id, data })`

**Config pattern** (from `config.ts`):
- Phase 16 adds `discovery` section to config with:
  - `paths: string[]` (default `["~"]`)
  - `scanIntervalMinutes: number` (default 60)
  - `githubOrgs: string[]`
  - `starSyncIntervalHours: number`

### Schema (Phase 16 provides)

The `discoveries` table already defined in `schema.ts`:
```
id (text PK), path, host, status (found/tracked/dismissed),
remoteUrl, name, lastCommitAt, discoveredAt, updatedAt
unique(path, host), idx on status, idx on host
```

Zod schemas in `@mission-control/shared`:
- `discoverySchema`, `createDiscoverySchema`, `updateDiscoveryStatusSchema`, `listDiscoveriesQuerySchema`

### Config (Phase 16 provides)

`mc.config.json` schema extended with `discovery.paths` (default `["~"]`) and `discovery.scanIntervalMinutes` (default 60).

### Reusable Functions

- `normalizeRemoteUrl()` from `git-health.ts` — normalize remote URLs for comparison
- `execFile` pattern from `project-scanner.ts` — running git commands
- `flattenToScanTargets()` — shows how config entries become scan targets (useful for extracting tracked paths)

## Architecture Decisions

### Discovery Service Design

```
discovery-scanner.ts (service)
├── scanForDiscoveries(config, db) — main scan function
│   ├── Expand ~ to home dir in config.discovery.paths
│   ├── For each root: fs.opendir() → list children
│   ├── Filter: has .git dir, not in exclusion list
│   ├── Filter: has >= 1 commit (git rev-list --count HEAD)
│   ├── Filter: path not already in mc.config.json projects
│   ├── Filter: not already in discoveries table as "dismissed"
│   ├── Collect git metadata: remote URL, last commit date, repo name
│   └── Upsert into discoveries table, emit SSE for new ones
├── promoteDiscovery(id, db, config) — track action
│   ├── Update discoveries status to "tracked"
│   ├── Atomic mc.config.json write (write to .tmp, rename)
│   ├── Insert into projects table
│   ├── Trigger single-project scan
│   └── Emit discovery:promoted SSE
└── dismissDiscovery(id, db) — dismiss action
    ├── Update discoveries status to "dismissed"
    └── Emit discovery:dismissed SSE (optional, for dashboard reactivity)
```

### Route Design

```
GET    /api/discoveries        — List discoveries (filter by status, host)
PATCH  /api/discoveries/:id    — Update status (tracked/dismissed)
POST   /api/discoveries/scan   — Trigger manual scan
```

### Filtering Logic

To determine which paths are "already tracked," extract all local project paths from `mc.config.json`:
1. Read config.projects
2. For each entry: if single-host with host="local", collect path. If multi-copy, collect local copy paths.
3. Compare discovered paths against this set.

Also check discoveries table for "dismissed" entries to avoid re-surfacing.

### Atomic Config Write

For promoting a discovery to tracked project:
1. Read current mc.config.json
2. Add new project entry: `{ name: discovery.name, slug: derived-from-name, path: discovery.path, host: "local" }`
3. Write to mc.config.json.tmp
4. Rename mc.config.json.tmp → mc.config.json (atomic on POSIX)
5. This is the same pattern used for any file that must survive crashes.

### Hard-Coded Exclusions

```typescript
const EXCLUDED_DIRS = new Set([
  "node_modules", ".Trash", "Library", ".cache", ".cargo",
  ".local", "Applications", ".npm", ".nvm", ".docker",
]);
```

### Git Metadata Collection

For each discovered repo, run one combined git command:
```bash
sh -c 'git remote get-url origin 2>/dev/null || echo "" && echo "===DELIM===" && git log -1 --format=%aI 2>/dev/null || echo ""'
```

This gives remote URL and last commit date in a single exec.

## Validation Architecture

### Testable Boundaries

1. **Discovery service** — unit testable with mock fs and mock git exec
2. **Query module** — testable with in-memory SQLite (existing pattern)
3. **Route handlers** — testable via Hono test client (existing pattern)
4. **Config write** — testable with temp directory

### Key Test Scenarios

1. Scan finds repos not in config → inserted as "found"
2. Scan skips repos already in config → not inserted
3. Scan skips dismissed repos → not re-surfaced
4. Scan skips repos with 0 commits → not surfaced
5. Scan skips excluded directories → not surfaced
6. Promote: config written atomically, project appears in DB
7. Dismiss: status updated, never re-surfaces
8. SSE events fire for discovery:found and discovery:promoted
9. Timer runs independently of project scan timer
10. ~ expansion works correctly in discovery paths

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Slow filesystem walk on large home dirs | Depth-1 only, excluded dirs filtered before stat |
| Race condition on mc.config.json write | tmp file + atomic rename |
| Stale discoveries after manual config edit | Re-scan compares against live config |
| Discovery timer blocks event loop | Async operations throughout, p-limit for git commands |

## RESEARCH COMPLETE
