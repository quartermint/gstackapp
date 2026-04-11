# CLAUDE.md — gstackapp

Cognitive code review platform for GitHub PRs. Runs multi-stage AI review pipelines (CEO, Eng, Design, QA, Security) on every PR, surfaces cross-repo intelligence, and visualizes quality trends.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**gstackapp**

Cognitive code review platform for GitHub PRs. Five AI review stages (CEO, Eng, Design, QA, Security) run as a pipeline on every PR, surface cross-repo intelligence ("Seen in your other repos"), and visualize quality trends over time. Built for the YC/gstack builder community — developers who ship daily and care about code quality, not enterprise procurement.

**Core Value:** Every PR gets reviewed by five specialized AI brains — each one catches what the others miss. The pipeline visualization makes the review process visible, not a black box.

### Constraints

- **Stack**: Hono + Postgres (Neon) + Drizzle + React — migrated from SQLite in c1fc394
- **Deploy**: Mac Mini via Tailscale Funnel — no cloud infra for Phase 1
- **AI Provider**: Claude API only — multi-provider deferred to Phase 2
- **Auth**: None for Phase 1 — dashboard is public, single-user
- **Display**: Desktop-only, dark mode only, 1024px min-width
- **Security**: Sandboxed AI file access — path resolution + symlink escape prevention
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Verdict on Decided Stack
## Recommended Stack
### Core Backend Framework
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Hono | ^4.12 | HTTP server, routing, middleware | Ultrafast, Web Standards-based, built-in SSE streaming via `streamSSE()`, native RPC client for type-safe frontend calls. 2.8M weekly downloads, 340% YoY growth. Proven in Ryan's MC stack. No reason to change. | HIGH |
| @hono/node-server | ^1.14 | Node.js adapter for Hono | Required to run Hono on Node.js (Mac Mini). Translates Web Standard Request/Response to Node HTTP. | HIGH |
### Database & ORM
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @neondatabase/serverless | ^1.0.2 | Neon Postgres driver | HTTP-based serverless Postgres driver. Connects to Neon cloud Postgres via NEON_CONNECTION_STRING. Migrated from better-sqlite3 in c1fc394. | HIGH |
| drizzle-orm | ^0.45 | Type-safe ORM | SQL-like query builder with full TypeScript inference. First-class Postgres driver via Neon serverless. Lightweight -- no heavy runtime like Prisma. Schema-as-code with push/migrate. | HIGH |
| drizzle-kit | ^0.30 | Migrations CLI | Schema push, migration generation, Drizzle Studio for DB inspection. | HIGH |
| Vector search | — | Deferred | Previously sqlite-vec. Migration to pgvector deferred to Phase 20 (DASH-05). Cross-repo search tests currently skipped. | — |
### AI / LLM
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @anthropic-ai/sdk | ^0.80 | Claude API client | Direct Anthropic SDK over Vercel AI SDK. Rationale: gstackapp is Claude-only Phase 1, uses tool_use heavily, and does NOT stream to a chat UI. Vercel AI SDK adds abstraction for multi-provider and frontend streaming -- neither needed here. Direct SDK gives full control over tool_use flows, structured outputs, and retry logic. | HIGH |
### GitHub Integration
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @octokit/webhooks | ^14.2 | Webhook verification & event routing | Type-safe event handling, built-in signature verification via x-hub-signature-256, parallel handler execution. The standard for GitHub App webhook processing. | HIGH |
| @octokit/rest | ^21.1 | GitHub REST API client | Post PR comments, read PR metadata, list files. Installation-scoped authentication via @octokit/auth-app. | HIGH |
| @octokit/auth-app | ^7.2 | GitHub App authentication | JWT generation, installation access token management (auto-refresh at 59 min). Required for all authenticated GitHub API calls. | HIGH |
| simple-git | ^3.27 | Git clone/diff operations | Shallow clone repos to /tmp for AI code reading. Programmatic `clone('--depth', '1')`, diff, file listing. Actively maintained, 3 weeks since last publish. | MEDIUM |
### Frontend
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| React | ^19.2 | UI framework | Latest stable (19.2.4). Proven ecosystem, component model fits dashboard views. Ryan's existing expertise. | HIGH |
| Vite | ^8.0 | Build tooling | Vite 8 with Rolldown (Rust-based bundler), 10-30x faster builds. Standard for React SPA. Sub-second HMR. | HIGH |
| @tanstack/react-query | ^5.95 | Server state management | Caching, background refetching, optimistic updates for dashboard data. 12M weekly downloads. Pairs with Hono RPC client. | HIGH |
| hono/client (hc) | built-in | Type-safe API client | Hono's RPC client infers request/response types from AppType. Zero-config end-to-end type safety without code generation. Replaces tRPC/OpenAPI client. | HIGH |
### Styling & Design System
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tailwind CSS | ^4.2 | Utility-first CSS | v4: CSS-first config (@theme), 5x faster builds, OKLCH colors, automatic content detection. Custom theme maps directly to DESIGN.md tokens. | HIGH |
| clsx | ^2.1 | Conditional classes | Tiny (228B), composable class merging for conditional styles. | HIGH |
| tailwind-merge | ^3.0 | Class conflict resolution | Resolves Tailwind class conflicts in component composition. Used with clsx. | MEDIUM |
### Charting / Data Visualization
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Recharts | ^2.15 | Quality trend charts | Declarative React components, SVG-based, works well under 10K data points (more than enough for quality trends). 3.6M weekly downloads. Line/area/bar charts for trend views. | HIGH |
### Validation & Shared Types
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Zod | ^3.24 | Runtime validation + TypeScript types | Shared schemas between pipeline stages, API request/response validation, Hono validator integration. Anthropic SDK structured outputs support Zod schemas directly. | HIGH |
### Streaming / Real-time
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Hono streamSSE | built-in | Server-Sent Events | Built into Hono's streaming helpers. Push pipeline stage updates (RUNNING -> PASS/FLAG/BLOCK) to dashboard in real time. Simpler than WebSockets for unidirectional server-to-client updates. | HIGH |
| EventSource (browser) | native | SSE client | Browser-native API for consuming SSE streams. No library needed. @tanstack/react-query can integrate with SSE for cache invalidation. | HIGH |
### Testing
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vitest | ^3.1 | Unit & integration tests | Vite-native, same config/transforms as the app. Hono provides `testClient` from `hono/testing` for type-safe API testing. Fast, parallel, watch mode. | HIGH |
### Infrastructure & Deployment
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tailscale Funnel | latest | Public HTTPS endpoint | Exposes Mac Mini HTTP service to internet with auto-provisioned TLS certificate. GitHub webhook URL = `https://<machine>.ts.net`. No firewall config, no DNS management, no cloud infra. | HIGH |
| tsx | ^4.19 | TypeScript execution | Run TypeScript directly in Node.js without a compile step. Used for dev server, scripts, seed data. | HIGH |
| Node.js | ^22 LTS | Runtime | LTS with stable ESM, fetch API, Web Crypto. Required by Hono's node-server adapter (18+). 22 preferred for performance. | HIGH |
### Monorepo Structure
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| npm workspaces | built-in | Monorepo management | Lightweight, zero-dependency monorepo. No Turborepo needed for 2-3 packages. `packages/api`, `packages/web`, `packages/shared`. | HIGH |
## Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | ^16.4 | Environment variables | Loading ANTHROPIC_API_KEY, GITHUB_APP credentials from .env |
| nanoid | ^5.0 | ID generation | Short, URL-safe unique IDs for pipeline runs, findings |
| date-fns | ^4.1 | Date formatting | Relative timestamps ("2 hours ago"), trend date ranges |
| pino | ^9.6 | Structured logging | JSON logging for pipeline execution, webhook events, errors |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Backend Framework | Hono | Express / Fastify | Express is legacy (5.x slow to ship). Fastify is good but heavier, no built-in RPC client. Hono's Web Standards approach and SSE helpers fit perfectly. |
| ORM | Drizzle | Prisma | Prisma's engine binary adds 15MB+, slower cold starts. Drizzle is SQL-first, lighter, type-safer with better Postgres ergonomics. |
| ORM | Drizzle | Kysely | Kysely is pure query builder without migrations or schema management. Drizzle includes drizzle-kit for migrations + studio. |
| Database | Postgres (Neon) | SQLite | SQLite was Phase 1 choice. Migrated to Neon Postgres in c1fc394 for cloud-hosted persistence and Drizzle dialect switching. Harness still uses better-sqlite3 for local token tracking. |
| Vector Search | pgvector (deferred) | sqlite-vec | sqlite-vec was Phase 1. pgvector is the target for Phase 20 (DASH-05). Cross-repo search tests currently skipped. |
| AI SDK | @anthropic-ai/sdk | Vercel AI SDK | Vercel AI SDK adds multi-provider abstraction not needed Phase 1. Direct SDK gives full tool_use control. |
| Frontend Framework | React + Vite | Next.js | Next.js is SSR/RSC-oriented. gstackapp is a dashboard SPA (no SEO needed, no auth, single page). Vite + React is simpler, faster to build. |
| Styling | Tailwind CSS | CSS Modules / styled-components | Tailwind's utility-first approach matches DESIGN.md token system. No CSS-in-JS runtime cost. |
| GitHub Integration | Octokit packages | Probot | Probot bundles its own HTTP server (Express). We already have Hono. Raw Octokit composes cleanly as Hono middleware. |
| Testing | Vitest | Jest | Vitest uses the same Vite transforms as the app. Jest requires separate babel/TS config. Vitest is faster and config-free for Vite projects. |
| Charting | Recharts | D3 / Chart.js | Recharts is React-native, declarative, handles trend charts. D3 fights React's model. Chart.js lacks React integration depth. |
| Build Tool | Vite 8 | Webpack / esbuild | Vite 8 with Rolldown is fastest. Webpack is legacy. esbuild is fast but lacks plugin ecosystem. |
| Monorepo | npm workspaces | Turborepo / Nx | Only 2-3 packages. Turborepo/Nx add complexity for minimal benefit at this scale. |
## Installation
# Initialize monorepo
# Core backend (packages/api)
# Backend dev dependencies
# Frontend (packages/web)
# Frontend dev dependencies
# Shared types (packages/shared)
## Project Structure
## Sources
- [Hono docs](https://hono.dev/docs) - Framework documentation, RPC, SSE helpers
- [Hono npm](https://www.npmjs.com/package/hono) - v4.12.9 (latest)
- [Drizzle ORM docs](https://orm.drizzle.team/) - Postgres driver, migrations
- [Drizzle npm](https://www.npmjs.com/package/drizzle-orm) - v0.45.2 (latest)
- [Neon serverless driver](https://www.npmjs.com/package/@neondatabase/serverless) - v1.0.2, HTTP-based Postgres
- [Anthropic SDK npm](https://www.npmjs.com/package/@anthropic-ai/sdk) - v0.80.0 (latest)
- [Anthropic tool_use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
- [Octokit webhooks.js](https://github.com/octokit/webhooks.js/) - v14.2.0
- [Octokit auth-app.js](https://github.com/octokit/auth-app.js/) - App authentication
- [React 19.2 blog](https://react.dev/blog/2025/10/01/react-19-2) - v19.2.4 stable
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) - v8.0.3 with Rolldown
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4) - v4.2, CSS-first config
- [TanStack Query](https://tanstack.com/query/latest) - v5.95.0
- [Vitest](https://vitest.dev/) - v3.1, Hono testClient integration
- [Tailscale Funnel docs](https://tailscale.com/kb/1223/funnel) - HTTPS endpoint provisioning
- [pgvector](https://github.com/pgvector/pgvector) - Target for cross-repo vector search (Phase 20, DASH-05)
- [Recharts](https://recharts.org/) - React charting library
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

<!-- stripe-projects-cli managed:claude-md:start -->
look at AGENTS.md for your rules
<!-- stripe-projects-cli managed:claude-md:end -->
