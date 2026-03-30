# Phase 1: Foundation & GitHub Integration - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Monorepo scaffold, database schema (6 tables), GitHub App registration/installation, webhook handling with idempotency, and Tailscale Funnel ingress. Everything else builds on this.

</domain>

<decisions>
## Implementation Decisions

### Monorepo Structure
- **D-01:** npm workspaces monorepo with `packages/api` (Hono backend), `packages/web` (React frontend), `packages/shared` (Zod schemas, types)
- **D-02:** Shared Zod schemas in `packages/shared` — StageResult, Finding, Verdict types used by both API and frontend

### Database Schema
- **D-03:** 6 tables: github_installations, repositories, pull_requests, pipeline_runs, stage_results, findings
- **D-04:** SQLite with WAL mode enabled from first migration (concurrent reads during pipeline execution)
- **D-05:** busy_timeout configured to prevent silent write drops
- **D-06:** Drizzle ORM with schema-as-code, drizzle-kit for migrations

### Webhook Handling
- **D-07:** X-GitHub-Delivery header as idempotency key — UNIQUE constraint, INSERT ON CONFLICT DO NOTHING
- **D-08:** ACK within 2 seconds (not just 10) — process pipeline async in-process
- **D-09:** Subscribe to: pull_request (opened, synchronize, reopened), installation (created, deleted), installation_repositories (added, removed)
- **D-10:** @octokit/webhooks for signature verification, @octokit/auth-app for installation tokens

### GitHub App Permissions
- **D-11:** Read: contents, metadata, pull_requests. Write: pull_requests (for comments and reviews)

### Dev Environment
- **D-12:** smee.io proxy for integration testing with real GitHub webhooks
- **D-13:** Captured webhook payload fixtures for unit tests and CI (no live GitHub dependency)
- **D-14:** Vitest with Hono testClient for API endpoint testing

### Infrastructure
- **D-15:** Tailscale Funnel for webhook ingress on Mac Mini
- **D-16:** Startup reconciliation: detect stale RUNNING pipelines on process start, mark as STALE

### Claude's Discretion
- Exact npm workspace configuration
- Dev server setup (concurrent API + web dev servers)
- ESLint/Prettier configuration
- GitHub App manifest details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture
- `.planning/research/ARCHITECTURE.md` — System structure, component boundaries, recommended project layout
- `.planning/research/STACK.md` — Verified package versions and rationale for every dependency

### Security
- `.planning/research/PITFALLS.md` §Pitfall 3 — Sandbox escape via symlink (CVE-2025-53109/53110), prevention strategy
- `.planning/research/PITFALLS.md` §Pitfall 2 — Webhook reliability without job queue, idempotency key pattern

### Design System
- `DESIGN.md` — Full design system (colors, typography, spacing, motion). Read before any frontend work.

### Project Context
- `.planning/PROJECT.md` — Vision, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements with REQ-IDs

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project

### Established Patterns
- None — patterns will be established in this phase

### Integration Points
- GitHub App webhook URL via Tailscale Funnel
- SQLite database at project root (or configurable path)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow the gstack Builder Ethos: "Boil the Lake" (do the complete thing) and "Search Before Building" (use proven patterns).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-github-integration*
*Context gathered: 2026-03-30*
