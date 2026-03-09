# Technology Stack

**Project:** Mission Control - Personal Operating Environment
**Researched:** 2026-03-09

## Recommended Stack

### Monorepo & Build

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| pnpm | 9.x | Package manager | Already in use. Workspace support, strict dependency resolution, disk efficiency. No reason to change. | HIGH |
| Turborepo | 2.x | Build orchestrator | Already in use. Caching, parallel task execution, minimal config. Perfect for this multi-package setup. | HIGH |
| TypeScript | 5.7+ | Language | Already in use. Strict mode everywhere. End-to-end type safety from DB schema to API to client. | HIGH |

### API Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Hono | 4.12+ | HTTP API framework | Ultrafast, tiny (~14KB), built on Web Standards. Built-in RPC client gives tRPC-like type safety without the complexity. SSE streaming helper is battle-tested. Runs on Node.js via @hono/node-server but could deploy to edge if needed later. Zod validation built in. | HIGH |
| @hono/node-server | latest | Node.js adapter | Production-ready adapter for running Hono on Node.js. Supports graceful shutdown, SSE, and standard Node.js deployment patterns (PM2, systemd). | HIGH |
| Zod | 3.x | Schema validation | De facto standard for TypeScript schema validation. Used at API boundaries, DB schema definitions (via Drizzle), and MCP tool definitions. One validation library everywhere. | HIGH |

**Why Hono over alternatives:**
- **vs Express:** 2-3x faster, native TypeScript, built-in RPC client, modern middleware system. Express is legacy.
- **vs Fastify:** Comparable performance but Hono is lighter, runs on more runtimes, and has a simpler API. Fastify's plugin system is over-engineered for a single-user platform.
- **vs tRPC:** Hono RPC provides the same end-to-end type safety but you keep RESTful URLs. Your API stays curl-friendly and MCP-friendly. tRPC locks you into its protocol.

### Database

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| SQLite (via better-sqlite3) | 12.6+ | Primary database | Single-file, zero-config, synchronous API (no async overhead for single-user), insanely fast reads. Perfect for Mac Mini self-hosted. No database server to manage. Backup is cp. | HIGH |
| Drizzle ORM | 0.45+ | Type-safe ORM | Lightweight, TypeScript-first, SQL-like API. Schema = source of truth. Generates migrations. Works perfectly with better-sqlite3. Prepared statement support for max performance. | HIGH |
| drizzle-kit | latest | Migration CLI | Schema push and migration management. SQLite-specific migration support including the `push` command for rapid development. | HIGH |
| SQLite FTS5 | built-in | Full-text search | Native SQLite extension for full-text search. Zero additional deps. Handles capture search, project name matching, text content search. | HIGH |
| sqlite-vec | 0.1+ | Vector search | Pure C, no dependencies, SIMD-accelerated KNN search. Loads as SQLite extension into better-sqlite3. Enables AI-powered semantic search across captures. | MEDIUM |

**Why SQLite over alternatives:**
- **vs PostgreSQL:** Overkill for single-user. Requires a running server. SQLite is the entire data layer in one file on the Mac Mini. Backup, migration, and disaster recovery are trivially simple.
- **vs Convex (existing):** Convex is a hosted service with real-time sync -- great for multi-user, wrong for a private self-hosted platform. SQLite gives you complete data sovereignty and zero network dependency.
- **vs Turso/libSQL:** Turso adds a server layer and edge replication you don't need. Pure SQLite is simpler. If you later need replication, libSQL is a drop-in replacement.

**Hybrid search strategy:** Use FTS5 for exact/keyword search and sqlite-vec for semantic/AI search. Combine results with Reciprocal Rank Fusion (RRF) in a single SQL query using CTEs. This is a proven pattern documented by the sqlite-vec author.

### AI & Embeddings

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @anthropic-ai/sdk | latest | AI categorization, NL search | Claude is the AI backbone. Used for capture categorization, natural language query interpretation, and project association. Already using Claude Max subscription. | HIGH |
| Embeddings (OpenAI text-embedding-3-small) | API | Vector embeddings | Best balance of quality vs cost for embeddings. 1536 dimensions, $0.02/1M tokens. Used to embed captures for semantic search. | MEDIUM |
| Ollama + nomic-embed-text | local | Local embedding fallback | Runs on Mac Mini for offline embedding generation. ~71% accuracy vs OpenAI's 76%, but zero cost and zero network dependency. Use as primary, OpenAI as quality fallback. | MEDIUM |

**Embedding strategy:** Generate embeddings locally with Ollama/nomic-embed-text for zero-cost, zero-latency operation. Fall back to OpenAI text-embedding-3-small if Ollama is unavailable or for batch re-embedding when quality matters. Store embeddings in sqlite-vec alongside the capture data.

### Frontend (Web Dashboard)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| React | 19.2+ | UI framework | Production-ready with React Compiler (auto-memoization), Actions API, and improved performance. Largest ecosystem for component libraries. You already know React from TaxNav. | HIGH |
| Vite | 6.x | Build tool + dev server | Fastest DX for React SPAs. HMR in milliseconds. Simple config. Already used in TaxNav. | HIGH |
| TanStack Router | 1.x | Type-safe routing | Full type safety for routes, params, and search params. Built-in code splitting. Integrates tightly with TanStack Query for data fetching. The modern React SPA router. | HIGH |
| TanStack Query | 5.x | Server state management | SWR caching, background refetching, optimistic updates. Pairs perfectly with Hono RPC client for type-safe data fetching. Handles SSE subscription management. | HIGH |
| Zustand | 5.x | Client state | ~3KB, zero boilerplate. For UI state only (sidebar open, active filter, keyboard shortcut state). TanStack Query handles all server state. | HIGH |
| Tailwind CSS | 4.x | Styling | v4 is a ground-up Rust rewrite -- 5x faster builds, CSS-first config, no JS config file needed. Native cascade layers, container queries. One-line setup: `@import "tailwindcss"`. | HIGH |
| Motion (Framer Motion) | 11.x | Animations | Declarative animations for dashboard transitions, card entrance effects, layout animations. 18M+ monthly downloads. Web Animations API for 120fps. Critical for the "Arc browser energy" visual identity. | HIGH |
| @tailwindcss/vite | latest | Vite integration | First-party Tailwind v4 Vite plugin for maximum performance and zero-config setup. | HIGH |

**Why React over alternatives:**
- **vs SolidJS:** SolidJS is faster in benchmarks but has 1/100th the ecosystem. For a dashboard with rich interactions, component library availability matters more than raw render speed. React 19's compiler closes the performance gap.
- **vs Svelte 5:** Strong contender, but you already know React, and TanStack Query + Router are React-first. Svelte's ecosystem for complex data-heavy dashboards is thinner.
- **vs Next.js:** SSR/SSG are unnecessary for a single-user dashboard behind Tailscale. Next.js adds complexity (server components, routing conventions, build overhead) you don't need. Vite + React SPA is simpler and faster to develop.

### Real-Time Updates

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Server-Sent Events (SSE) | native | Real-time dashboard updates | One-way server-to-client is exactly what a dashboard needs. Simpler than WebSockets, auto-reconnect built into browser API, works perfectly with HTTP/2 multiplexing. Hono has built-in SSE helper. | HIGH |
| EventSource API | native | Client-side SSE consumer | Browser-native, no library needed. TanStack Query can subscribe to SSE streams for automatic cache invalidation. | HIGH |

**Why SSE over WebSockets:**
- Dashboard is read-heavy. Server pushes updates (new capture arrived, project status changed, job completed). Client rarely needs to push data (that's what the REST API is for).
- SSE auto-reconnects. WebSockets require manual reconnection logic.
- SSE works over HTTP/2 -- multiple streams on one connection. No special protocol upgrade.
- "WebSockets are ideal for perhaps 5% of real-time features in production today" -- the dashboard is firmly in the 95%.

### MCP Integration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @modelcontextprotocol/sdk | latest | MCP server + client | Official TypeScript SDK. MC exposes an MCP server (tools: create_capture, get_project_status, search_captures) and consumes MCP servers (portfolio-dashboard, mac-mini-bridge). Supports Streamable HTTP transport for remote servers and stdio for local. | HIGH |

### Audio & Voice Capture

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| File system storage | native | Audio blob storage | Store audio files on Mac Mini filesystem (e.g., `~/.mission-control/audio/`), reference by path in SQLite. Don't store blobs in SQLite -- it degrades performance and complicates backup. | HIGH |
| whisper-node / nodejs-whisper | latest | Local transcription | Wraps OpenAI Whisper model for CPU-based local transcription. Runs on Mac Mini. No API costs, no network dependency. Requires FFmpeg. | MEDIUM |
| multer | latest | File upload middleware | Standard Node.js middleware for multipart/form-data. Handles audio file uploads from iOS app and web dashboard. | HIGH |

**Audio storage strategy:** Audio files stored as `.webm` or `.m4a` on the Mac Mini filesystem in a structured directory (`/audio/YYYY/MM/uuid.ext`). SQLite row stores: file path, duration, size, transcription text, embedding vector. This keeps the database fast and backupable while audio files are just files.

### iOS Companion App

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Swift 6 / SwiftUI | iOS 17+ | Native iOS app | Already your expertise. SwiftUI for UI, Swift concurrency for async. App Groups for share extension data sharing. | HIGH |
| SwiftData | iOS 17+ | Local persistence + offline queue | Apple's modern persistence framework. Store captures locally when offline. Sync to MC API when reconnected via background tasks. | HIGH |
| WidgetKit | iOS 17+ | Home screen widget | Quick-capture widget. 3 taps max: tap widget -> type/speak -> done. Uses App Group shared container with main app. | HIGH |
| Share Extension | iOS 17+ | Share sheet capture | UIHostingViewController + SwiftUI view for share extension UI. Writes to App Group shared container, main app syncs to MC. | HIGH |
| AVFoundation | iOS 17+ | Voice recording | Record audio, encode to M4A/AAC. Store locally, upload when connected. | HIGH |
| Speech framework | iOS 17+ | On-device transcription | Apple's built-in speech recognition for immediate local transcription. Whisper on server for higher quality re-transcription. | MEDIUM |

### CLI Capture

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js CLI (bin script) | - | Terminal capture | `mc capture "thought about project X"` -- simple stdin/arg capture. Ships as part of the monorepo, installed globally via `pnpm link`. Calls the same Hono API. | HIGH |
| Local queue (file-based) | - | Offline CLI capture | When Mac Mini unreachable, write captures to `~/.mc/queue/` as JSON files. Background sync when API is reachable. Simple, debuggable, no dependencies. | HIGH |

### Deployment & Infrastructure

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Mac Mini | M-series | Host platform | Already running. Go services, Docker, training jobs. Add MC as another service. | HIGH |
| Tailscale | latest | Network access | Already configured. Private mesh VPN. `tailscale serve` can act as reverse proxy with automatic HTTPS. | HIGH |
| PM2 | latest | Process manager | Production-grade Node.js process manager. Auto-restart, log management, cluster mode if needed. Zero-downtime reloads on deploy. | HIGH |
| Caddy | 2.x | Reverse proxy (optional) | If `tailscale serve` isn't sufficient, Caddy provides automatic HTTPS, clean reverse proxy config, and can serve the Vite-built SPA static files alongside the API. | MEDIUM |
| systemd / launchd | native | Service management | launchd on Mac Mini for auto-start on boot. Plist config for the Node.js API server. | HIGH |

### Dev & Testing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vitest | 3.x | Test runner | Fast, Vite-native, TypeScript-first. Compatible with Jest API. Already used in existing MC packages. | HIGH |
| Biome | 1.x | Linting + formatting | Replaces ESLint + Prettier. Single tool, 10-100x faster (Rust-based). Opinionated defaults. Less config. | MEDIUM |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| API Framework | Hono | Fastify | Heavier, Node.js only, plugin system is overkill for single-user |
| API Framework | Hono | Express | Legacy, slow, no built-in TypeScript, no RPC client |
| API Framework | Hono | tRPC | Not RESTful, harder to consume from non-TS clients (iOS, MCP, CLI), more complex setup |
| Database | SQLite + better-sqlite3 | PostgreSQL | Overkill -- requires running server, complex backup, unnecessary for single-user |
| Database | SQLite + better-sqlite3 | Convex | Hosted service, no data sovereignty, network dependency, wrong model for self-hosted |
| ORM | Drizzle | Prisma | Heavier, generates client, slower query execution, worse SQLite support |
| ORM | Drizzle | Kysely | Good but Drizzle has better migration tooling and schema-as-code |
| Frontend | React 19 + Vite | Next.js | SSR/SSG unnecessary for private SPA, adds complexity for no benefit |
| Frontend | React 19 + Vite | SolidJS | Tiny ecosystem, limited component libraries for dashboard UIs |
| Frontend | React 19 + Vite | Svelte 5 | Good framework but React has deeper ecosystem for data-heavy dashboards and you already know React |
| State | Zustand | Redux Toolkit | Redux is overkill when TanStack Query handles server state |
| State | Zustand | Jotai | Jotai better for fine-grained reactivity; Zustand is simpler for the small amount of client state needed |
| Router | TanStack Router | React Router v7 | TanStack Router has superior type safety, built-in code splitting, and tighter TanStack Query integration |
| Real-time | SSE | WebSockets | Bidirectional not needed; SSE is simpler, auto-reconnects, works over HTTP/2 |
| Vector DB | sqlite-vec | pgvector | Would require PostgreSQL; sqlite-vec keeps everything in SQLite |
| Vector DB | sqlite-vec | Pinecone/Weaviate | External service, network dependency, overkill for personal scale |
| Styling | Tailwind v4 | CSS Modules | Tailwind is faster to develop with, consistent design system, v4 is a massive DX improvement |
| Animations | Motion (Framer Motion) | CSS transitions | CSS transitions can't handle layout animations, orchestrated sequences, or gesture-driven animations needed for Arc-like UX |
| Process Manager | PM2 | Docker | Docker adds a layer of complexity for a single Node.js process on a machine you own |

## Package Structure (Proposed)

```
mission-control/
  apps/
    web/                    # React + Vite SPA (dashboard)
    ios/                    # Swift/SwiftUI iOS app
    cli/                    # Node.js CLI capture tool
  packages/
    api/                    # Hono API server
    db/                     # Drizzle schema, migrations, queries
    shared/                 # Zod schemas, types, constants
    mcp/                    # MCP server + client integrations
    ai/                     # Embedding generation, AI categorization
  .planning/                # GSD project management
```

## Installation

```bash
# Core API
pnpm add hono @hono/node-server zod drizzle-orm better-sqlite3 sqlite-vec

# AI & Embeddings
pnpm add @anthropic-ai/sdk @modelcontextprotocol/sdk

# Audio handling
pnpm add multer

# Dev dependencies
pnpm add -D drizzle-kit @types/better-sqlite3 @types/multer vitest typescript

# Web dashboard (apps/web)
pnpm add react react-dom @tanstack/react-router @tanstack/react-query zustand motion
pnpm add -D @vitejs/plugin-react vite tailwindcss @tailwindcss/vite

# Process management (production)
pnpm add -g pm2
```

## Version Verification

| Package | Claimed Version | Verified Via | Date |
|---------|----------------|-------------|------|
| Hono | 4.12.5 | npm registry, GitHub releases | 2026-03-09 |
| React | 19.2.4 | npm registry, react.dev | 2026-03-09 |
| Drizzle ORM | 0.45.1 | npm registry | 2026-03-09 |
| better-sqlite3 | 12.6.2 | npm registry | 2026-03-09 |
| Tailwind CSS | 4.x (v4.0 released Jan 2025, v4.1 Apr 2025) | tailwindcss.com, GitHub releases | 2026-03-09 |
| TanStack Router | 1.166.3 | npm registry | 2026-03-09 |
| Vite | 6.x | vite.dev | 2026-03-09 |
| @modelcontextprotocol/sdk | latest (spec 2025-11-25) | npm, GitHub | 2026-03-09 |
| Motion (Framer Motion) | 11.x | npm registry | 2026-03-09 |

## Sources

- [Hono Official Docs](https://hono.dev/) - Framework documentation, RPC guide, SSE helper, Node.js adapter
- [Hono RPC Guide](https://hono.dev/docs/guides/rpc) - Type-safe client documentation
- [Hono Streaming Helper](https://hono.dev/docs/helpers/streaming) - SSE implementation
- [Drizzle ORM SQLite Docs](https://orm.drizzle.team/docs/get-started-sqlite) - SQLite driver setup
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) - Vector search extension
- [sqlite-vec Hybrid Search](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) - FTS5 + sqlite-vec combination
- [SQLite FTS5 Extension](https://sqlite.org/fts5.html) - Full-text search docs
- [React v19](https://react.dev/blog/2024/12/05/react-19) - React 19 release notes
- [React 19.2](https://react.dev/blog/2025/10/01/react-19-2) - React 19.2 release notes
- [TanStack Router Docs](https://tanstack.com/router/latest) - Router documentation
- [Tailwind CSS v4.0](https://tailwindcss.com/blog/tailwindcss-v4) - v4 release announcement
- [Vite 6.0](https://vite.dev/blog/announcing-vite6) - Vite 6 release
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) - Official MCP SDK
- [Motion for React](https://motion.dev/docs/react) - Animation library docs
- [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve) - Reverse proxy docs
- [Turborepo Docs](https://turborepo.dev/docs) - Build system docs
- [Better Stack Hono vs Fastify](https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/) - Framework comparison
- [FreeCodeCamp SSE vs WebSockets](https://www.freecodecamp.org/news/server-sent-events-vs-websockets/) - Protocol comparison
