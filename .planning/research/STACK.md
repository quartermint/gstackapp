# Technology Stack

**Project:** gstackapp (Cognitive Code Review Platform)
**Researched:** 2026-03-30

## Verdict on Decided Stack

The decided stack (Hono + SQLite + Drizzle + React + Claude API + sqlite-vec) is **validated and strong**. Every choice holds up under scrutiny. Below I confirm each choice with specific versions and fill in the gaps (GitHub integration, frontend tooling, charting, testing, deployment).

## Recommended Stack

### Core Backend Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Hono | ^4.12 | HTTP server, routing, middleware | Ultrafast, Web Standards-based, built-in SSE streaming via `streamSSE()`, native RPC client for type-safe frontend calls. 2.8M weekly downloads, 340% YoY growth. Proven in Ryan's MC stack. No reason to change. | HIGH |
| @hono/node-server | ^1.14 | Node.js adapter for Hono | Required to run Hono on Node.js (Mac Mini). Translates Web Standard Request/Response to Node HTTP. | HIGH |

### Database & ORM

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| better-sqlite3 | ^11.8 | SQLite driver | Synchronous API, fastest SQLite driver for Node.js. Outperforms both node-sqlite3 and node:sqlite (still experimental). WAL mode + synchronous=normal for concurrent reads during pipeline execution. | HIGH |
| drizzle-orm | ^0.45 | Type-safe ORM | SQL-like query builder with full TypeScript inference. First-class better-sqlite3 driver. Lightweight -- no heavy runtime like Prisma. Schema-as-code with push/migrate. | HIGH |
| drizzle-kit | ^0.30 | Migrations CLI | Schema push, migration generation, Drizzle Studio for DB inspection. | HIGH |
| sqlite-vec | ^0.1.8 | Vector embeddings | Zero-dependency C extension, loads via `sqliteVec.load(db)` into better-sqlite3. Brute-force KNN search sufficient for cross-repo findings at single-user scale. DiskANN coming. | HIGH |

### AI / LLM

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @anthropic-ai/sdk | ^0.80 | Claude API client | Direct Anthropic SDK over Vercel AI SDK. Rationale: gstackapp is Claude-only Phase 1, uses tool_use heavily, and does NOT stream to a chat UI. Vercel AI SDK adds abstraction for multi-provider and frontend streaming -- neither needed here. Direct SDK gives full control over tool_use flows, structured outputs, and retry logic. | HIGH |

**Why NOT Vercel AI SDK:** Vercel AI SDK shines when you need (a) multi-provider switching, (b) streaming into React UI via `useChat`/`useCompletion`. gstackapp does neither -- it runs 5 server-side tool_use pipelines and posts results as GitHub PR comments. The direct SDK is simpler, lighter, and gives full control over the tool_use loop. If multi-provider becomes a Phase 2 goal, AI SDK can be adopted then without rewriting the pipeline (just swap the client call).

### GitHub Integration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @octokit/webhooks | ^14.2 | Webhook verification & event routing | Type-safe event handling, built-in signature verification via x-hub-signature-256, parallel handler execution. The standard for GitHub App webhook processing. | HIGH |
| @octokit/rest | ^21.1 | GitHub REST API client | Post PR comments, read PR metadata, list files. Installation-scoped authentication via @octokit/auth-app. | HIGH |
| @octokit/auth-app | ^7.2 | GitHub App authentication | JWT generation, installation access token management (auto-refresh at 59 min). Required for all authenticated GitHub API calls. | HIGH |
| simple-git | ^3.27 | Git clone/diff operations | Shallow clone repos to /tmp for AI code reading. Programmatic `clone('--depth', '1')`, diff, file listing. Actively maintained, 3 weeks since last publish. | MEDIUM |

**Why NOT Probot:** Probot is a full framework (its own server, Express-based routing, config management). gstackapp already has Hono as its server framework. Using Probot would mean running two HTTP frameworks or fighting Probot's opinions. Raw Octokit packages compose cleanly into Hono middleware.

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

**Why NOT shadcn/ui:** DESIGN.md specifies a bespoke design system (electric lime accent, operations-room aesthetic, custom pipeline topology). shadcn/ui components would need heavy restyling and fight the design direction. Build components from scratch with Tailwind -- fewer dependencies, full control over the industrial precision aesthetic.

### Charting / Data Visualization

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Recharts | ^2.15 | Quality trend charts | Declarative React components, SVG-based, works well under 10K data points (more than enough for quality trends). 3.6M weekly downloads. Line/area/bar charts for trend views. | HIGH |

**Why NOT D3:** D3 gives absolute control but fights React's rendering model. Quality trend charts are standard line/area/bar -- Recharts handles this declaratively without D3's imperative DOM manipulation. D3 is overkill for this use case.

**Why NOT the pipeline visualization with Recharts:** The pipeline topology view is custom SVG/CSS -- not a chart. It's a connected node graph with glow effects, trace animations, and stage-specific colors. Build with raw SVG + React components + CSS animations per DESIGN.md spec.

### Validation & Shared Types

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Zod | ^3.24 | Runtime validation + TypeScript types | Shared schemas between pipeline stages, API request/response validation, Hono validator integration. Anthropic SDK structured outputs support Zod schemas directly. | HIGH |

**Note on Zod 4:** Zod 4 (z.xor, loose records, improved intersections) is available but still new. Stick with Zod 3.x for stability -- the migration path is straightforward when ready.

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

**Why NOT Turborepo:** Turborepo adds caching and orchestration for large monorepos (10+ packages). gstackapp has 2-3 packages -- npm workspaces handles linking, shared dependencies, and workspace scripts. Keep it simple.

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
| ORM | Drizzle | Prisma | Prisma's engine binary adds 15MB+, slower cold starts, worse SQLite support. Drizzle is SQL-first, lighter, type-safer. |
| ORM | Drizzle | Kysely | Kysely is pure query builder without migrations or schema management. Drizzle includes drizzle-kit for migrations + studio. |
| Database | SQLite + better-sqlite3 | PostgreSQL | Postgres is overkill for single-user Phase 1. SQLite with WAL mode handles concurrent reads perfectly. Same-machine DB = zero network latency. Migration path to Postgres exists via Drizzle's dialect switching. |
| Vector Search | sqlite-vec | pgvector | Requires PostgreSQL. sqlite-vec keeps the single-DB simplicity. Brute-force KNN is fast enough for <100K embeddings. |
| AI SDK | @anthropic-ai/sdk | Vercel AI SDK | Vercel AI SDK adds multi-provider abstraction not needed Phase 1. Direct SDK gives full tool_use control. |
| Frontend Framework | React + Vite | Next.js | Next.js is SSR/RSC-oriented. gstackapp is a dashboard SPA (no SEO needed, no auth, single page). Vite + React is simpler, faster to build. |
| Styling | Tailwind CSS | CSS Modules / styled-components | Tailwind's utility-first approach matches DESIGN.md token system. No CSS-in-JS runtime cost. |
| GitHub Integration | Octokit packages | Probot | Probot bundles its own HTTP server (Express). We already have Hono. Raw Octokit composes cleanly as Hono middleware. |
| Testing | Vitest | Jest | Vitest uses the same Vite transforms as the app. Jest requires separate babel/TS config. Vitest is faster and config-free for Vite projects. |
| Charting | Recharts | D3 / Chart.js | Recharts is React-native, declarative, handles trend charts. D3 fights React's model. Chart.js lacks React integration depth. |
| Build Tool | Vite 8 | Webpack / esbuild | Vite 8 with Rolldown is fastest. Webpack is legacy. esbuild is fast but lacks plugin ecosystem. |
| Monorepo | npm workspaces | Turborepo / Nx | Only 2-3 packages. Turborepo/Nx add complexity for minimal benefit at this scale. |

## Installation

```bash
# Initialize monorepo
npm init -w packages/api -w packages/web -w packages/shared

# Core backend (packages/api)
npm install -w packages/api hono @hono/node-server better-sqlite3 drizzle-orm sqlite-vec @anthropic-ai/sdk @octokit/webhooks @octokit/rest @octokit/auth-app simple-git zod pino nanoid dotenv

# Backend dev dependencies
npm install -w packages/api -D drizzle-kit @types/better-sqlite3 tsx vitest @types/node

# Frontend (packages/web)
npm install -w packages/web react react-dom @tanstack/react-query recharts hono date-fns clsx tailwind-merge

# Frontend dev dependencies
npm install -w packages/web -D vite @vitejs/plugin-react tailwindcss @types/react @types/react-dom typescript vitest

# Shared types (packages/shared)
npm install -w packages/shared zod
```

## Project Structure

```
gstackapp/
  packages/
    api/                    # Hono backend
      src/
        index.ts            # Hono app, webhook routes, SSE endpoints
        db/
          schema.ts         # Drizzle schema (6 tables)
          index.ts          # Database connection + sqlite-vec init
          migrations/       # Drizzle migrations
        pipeline/
          runner.ts         # Orchestrate 5 parallel stages
          stages/           # CEO, Eng, Design, QA, Security
          prompts/          # Prompt files (*.md) per stage
          tools.ts          # read_file, list_files, search_code
        github/
          webhook.ts        # @octokit/webhooks handler
          auth.ts           # @octokit/auth-app setup
          comments.ts       # PR comment posting/updating
          clone.ts          # Shallow clone to /tmp
        routes/
          api.ts            # Dashboard data API routes
          sse.ts            # SSE streaming for pipeline updates
    web/                    # React SPA
      src/
        App.tsx
        components/
          Pipeline/         # Pipeline topology visualization
          Timeline/         # PR review feed
          Trends/           # Quality trend charts (Recharts)
          Onboarding/       # Install flow wizard
        hooks/
          useSSE.ts         # SSE subscription hook
          useApi.ts         # Hono RPC client setup
        styles/
          theme.ts          # DESIGN.md tokens as CSS/TW config
    shared/                 # Shared Zod schemas
      src/
        schemas/
          stage-result.ts   # StageResult schema + verdict types
          findings.ts       # Per-stage finding schemas
          pipeline.ts       # PipelineRun schema
```

## Sources

- [Hono docs](https://hono.dev/docs) - Framework documentation, RPC, SSE helpers
- [Hono npm](https://www.npmjs.com/package/hono) - v4.12.9 (latest)
- [Drizzle ORM docs](https://orm.drizzle.team/) - SQLite driver, migrations
- [Drizzle npm](https://www.npmjs.com/package/drizzle-orm) - v0.45.2 (latest)
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) - v0.1.8, Node.js usage
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
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) - Fastest SQLite for Node.js
- [Recharts](https://recharts.org/) - React charting library
