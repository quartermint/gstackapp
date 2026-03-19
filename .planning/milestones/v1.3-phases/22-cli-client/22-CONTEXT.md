# Phase 22: CLI Client - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

New `packages/cli` package. Commands: `mc capture`, `mc status`, `mc projects`, `mc init`. Piped input, explicit project assignment, offline queue. Plain fetch against MC API (not Hono RPC). Bundled with tsup following MCP package pattern.

</domain>

<decisions>
## Implementation Decisions

### CLI personality
- Friendly but brief — like `gh` CLI energy
- Light color output, one-line confirmations: "✓ Captured to mission-control"
- Errors are helpful sentences, not stack traces
- Color enabled by default (respects NO_COLOR env var per convention)
- Exit codes: 0 success, 1 error, 2 offline (queued)

### Commands
- `mc capture "thought"` — send capture to API. Print capture ID + project name on success.
- `mc capture -p <slug> "thought"` — explicit project assignment, skips AI categorization
- `mc capture` with piped stdin: `echo "idea" | mc capture` — detect via `!process.stdin.isTTY`
- `mc status` — project summary: active/idle/stale counts, health overview, active sessions count
- `mc projects` — table of all tracked projects: name, status, last commit age, health indicator (✓/⚠/✗)
- `mc init` — configure API URL. Auto-detect Mac Mini Tailscale IP (100.123.8.125). Write `~/.mc/config.json`.

### Offline queue
- When API returns error or times out: persist to `~/.mc/queue.jsonl` (one JSON object per line)
- Print: "⚠ Queued locally (MC unreachable). Will sync on next successful call."
- Auto-flush queue on next successful `mc capture` call
- Queue entries include timestamp so they can be ordered correctly on flush

### API client
- Plain `fetch()` against MC API base URL (from `~/.mc/config.json`)
- NOT Hono RPC client (avoids bundling API as runtime dependency)
- 5-second timeout on all API calls
- Project detection from cwd: `GET /api/projects` then match cwd against known paths

### Package setup
- `packages/cli` in monorepo
- Commander.js for argument parsing
- tsup bundle with `noExternal` for shared schemas, `banner: { js: '#!/usr/bin/env node' }` for shebang
- Install via `pnpm link` or symlink to `/usr/local/bin/mc`

### Claude's Discretion
- Exact Commander.js subcommand structure
- Table formatting for `mc projects` output
- `~/.mc/config.json` schema
- Shell completion implementation
- Error message wording

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Package pattern
- `packages/mcp/` — Reference for standalone package in monorepo: tsup config, bin field, noExternal, shebang
- `packages/mcp/tsup.config.ts` — Bundle configuration to mirror
- `packages/mcp/package.json` — bin field, dependencies, scripts

### API endpoints
- `packages/api/src/routes/captures.ts` — POST /api/captures (mc capture target)
- `packages/api/src/routes/projects.ts` — GET /api/projects (mc projects/status data source)
- `packages/api/src/routes/sessions.ts` — GET /api/sessions (active session count for mc status)

### Shared types
- `packages/shared/src/` — Zod schemas for request/response validation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- MCP package: complete reference for tsup-bundled CLI in this monorepo
- Shared Zod schemas: can validate API responses in CLI
- Capture creation schema: reuse for request body construction

### Established Patterns
- MCP package uses plain fetch (not Hono RPC) — same approach for CLI
- tsup with noExternal bundles shared package inline
- shebang via banner option in tsup config

### Integration Points
- CLI calls existing API endpoints — no backend changes needed
- `~/.mc/config.json` is CLI-only config (API URL, defaults)
- pnpm workspace: `packages/cli` joins existing monorepo structure

</code_context>

<specifics>
## Specific Ideas

- `mc init` should feel like `gh auth login` — guided, friendly, confirms connection
- Offline queue message should be reassuring, not alarming — user shouldn't worry about lost data

</specifics>

<deferred>
## Deferred Ideas

- `mc search "query"` — search captures/projects from terminal. Could add in Phase 22 if scope allows, otherwise future.
- Shell completion scripts for bash/zsh — nice to have, not blocking.

</deferred>

---

*Phase: 22-cli-client*
*Context gathered: 2026-03-16*
