# Phase 1: Foundation - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Working API server on the Mac Mini that stores and retrieves captures, projects, and metadata — the shared platform every client builds on. Includes Hono API, SQLite database with FTS5, project data aggregation from local repos, and a minimal React dashboard scaffold proving the full stack end-to-end.

</domain>

<decisions>
## Implementation Decisions

### Project data sourcing
- Direct repo scanning on Mac Mini — no MCP dependency in Phase 1 (MCP consumption deferred to Phase 5)
- Config file (`mc.config.json`) lists repo paths explicitly — add/remove projects by editing config
- On-demand refresh (API call triggers fresh scan) + background poll every 5-10 min for ambient freshness
- Config file gitignored with `.example` checked in showing the shape

### Repo transition
- Wipe all old ZeroClaw code: packages/, apps/, convex/, dashboard/, scripts/, old docs (ARCHITECTURE.md, SECURITY.md, CONTRIBUTING.md, etc.)
- Clean monorepo structure: `packages/api/` (Hono), `packages/web/` (React dashboard), `packages/shared/` (types, schemas)
- `.planning/` directory preserved — GSD state carries forward
- Git history tells the story of the old codebase; no need for legacy archives

### Dashboard scaffold
- Phase 1 includes a minimal React/Vite SPA scaffold served by Hono
- Shell only — blank page or raw project list as proof-of-life
- `pnpm dev` starts everything (API + web)
- Phase 2 builds the real departure board UI on top of this scaffold

### Claude's Discretion
- Project metadata storage approach (config vs SQLite) — pick what's cleanest for the architecture
- API response conventions (error shapes, pagination, envelope patterns)
- Data model details (table schemas, field types, indexes)
- Monorepo tooling config (Turborepo settings, tsconfig structure)
- Background polling implementation (interval, caching strategy)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — clean slate. All existing packages/ and apps/ code is from the ZeroClaw AI gateway vision and will be deleted.

### Established Patterns
- pnpm + Turborepo monorepo pattern already in use (pnpm-workspace.yaml, turbo.json exist) — new code reuses this pattern with fresh config
- TypeScript strict mode enforced across the old codebase — carry forward

### Integration Points
- `.planning/` directory: GSD state machine files persist across the transition
- Portfolio-dashboard MCP server: exists as a separate project, will be consumed in Phase 5 (not Phase 1)
- Mac Mini: target deployment environment, repos live at ~/ paths, Tailscale provides network access

</code_context>

<specifics>
## Specific Ideas

- Research recommends: "ship value fast" — dashboard scaffold in Phase 1 prevents the perfectionism trap by proving the full stack works immediately
- Config file pattern mirrors how portfolio-dashboard MCP discovers repos — familiar approach
- Research flags: validate sqlite-vec Node.js native extension loading on Mac Mini Apple Silicon early, and verify Drizzle + FTS5 raw SQL compatibility

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-09*
