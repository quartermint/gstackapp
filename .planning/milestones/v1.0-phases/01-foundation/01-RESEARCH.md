# Phase 1: Foundation - Research

**Researched:** 2026-03-09
**Domain:** API server + SQLite database + project data aggregation + monorepo scaffolding
**Confidence:** HIGH

## Summary

Phase 1 transforms the existing ZeroClaw codebase into a clean monorepo running a Hono API server on Node.js with SQLite (better-sqlite3 + Drizzle ORM) as the data layer. The phase delivers: CRUD for captures, project data aggregation from local git repos, FTS5 full-text search, a minimal React/Vite dashboard scaffold, and the monorepo infrastructure that all subsequent phases build on.

The technical risk is low -- Hono + better-sqlite3 + Drizzle is a well-documented, well-tested stack. The primary challenge is the repo transition: wiping all old ZeroClaw code while preserving `.planning/` and git history, then standing up the new monorepo structure with working `pnpm dev` across API and web packages. The second challenge is FTS5 integration with Drizzle, which requires raw SQL for virtual table creation (Drizzle has no native FTS5 support) managed via custom migrations.

**Primary recommendation:** Build the API package first with SQLite schema + FTS5 + project scanning, verify it works standalone, then scaffold the web package and wire it to the API via Hono's static file serving. The repo wipe should be the very first task -- a clean surgical deletion that establishes the new directory structure.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Project data sourcing: Direct repo scanning on Mac Mini -- no MCP dependency in Phase 1 (MCP consumption deferred to Phase 5)
- Config file (`mc.config.json`) lists repo paths explicitly -- add/remove projects by editing config
- On-demand refresh (API call triggers fresh scan) + background poll every 5-10 min for ambient freshness
- Config file gitignored with `.example` checked in showing the shape
- Repo transition: Wipe all old ZeroClaw code (packages/, apps/, convex/, dashboard/, scripts/, old docs)
- Clean monorepo structure: `packages/api/` (Hono), `packages/web/` (React dashboard), `packages/shared/` (types, schemas)
- `.planning/` directory preserved -- GSD state carries forward
- Dashboard scaffold: Phase 1 includes a minimal React/Vite SPA scaffold served by Hono
- Shell only -- blank page or raw project list as proof-of-life
- `pnpm dev` starts everything (API + web)

### Claude's Discretion
- Project metadata storage approach (config vs SQLite) -- pick what's cleanest for the architecture
- API response conventions (error shapes, pagination, envelope patterns)
- Data model details (table schemas, field types, indexes)
- Monorepo tooling config (Turborepo settings, tsconfig structure)
- Background polling implementation (interval, caching strategy)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | API server accepts and responds to HTTP requests with structured JSON on Mac Mini behind Tailscale | Hono 4.12+ with @hono/node-server adapter; serve() on configurable port; structured JSON via c.json() |
| FOUND-02 | SQLite database stores and retrieves captures, projects, and metadata with WAL mode for concurrent reads | better-sqlite3 12.6+ with Drizzle ORM; WAL enabled via sqlite.pragma("journal_mode = WAL"); Drizzle schema-as-code with migrations |
| FOUND-03 | FTS5 full-text search indexes captures, project metadata, and commit messages with BM25 ranking | FTS5 virtual tables created via Drizzle custom migrations (raw SQL); BM25 ranking with column weighting; triggers or manual sync to keep FTS in sync |
| FOUND-04 | API endpoints exist for: CRUD captures, list/detail projects, search, health check | Hono route groups; zValidator + Zod for request validation; Hono RPC (hc) for type-safe client; nanoid for ID generation |
| FOUND-05 | Project data aggregation pulls git status, recent commits, GSD state, and dirty file indicators from local repos | child_process.execFile for git commands (same pattern as portfolio-dashboard); mc.config.json for project registry; in-memory cache with TTL |
| PLAT-01 | Every dashboard feature is backed by a documented API endpoint -- no server-rendered shortcuts | API-first architecture enforced by monorepo separation (packages/api serves data, packages/web consumes it); Hono RPC exports type for frontend |
| PLAT-02 | API design does not preclude multi-user access in the future (user context in requests) | Optional userId header/parameter on all endpoints; schema includes userId column (nullable for v1) |
| PLAT-03 | API is accessible only via Tailscale -- private but built like a product | Listen on 0.0.0.0 (accessible to Tailscale peers); no auth middleware in v1; optional MC_API_KEY for belt-and-suspenders |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | 4.12+ | HTTP API framework | Ultrafast (~14KB), built-in RPC client for type-safe frontend calls, native SSE streaming, Zod validation middleware. Runs on Node.js via @hono/node-server. |
| @hono/node-server | 1.14+ | Node.js adapter for Hono | Production-ready. Supports graceful shutdown, SSE, static file serving. Requires Node 18.14.1+. |
| @hono/zod-validator | latest | Request validation middleware | zValidator validates json, query, param, header, cookie targets. Returns typed context. Required for Hono RPC type inference. |
| better-sqlite3 | 12.6+ | SQLite driver | Synchronous API (no async overhead for single-user), fastest Node.js SQLite driver, proven production usage. Prebuilt binaries for Apple Silicon. |
| Drizzle ORM | 0.45+ | Type-safe ORM | Lightweight, TypeScript-first, SQL-like query builder. Schema = source of truth. Generates migrations. Supports better-sqlite3 natively. |
| drizzle-kit | latest | Migration CLI | `generate` creates SQL migration files, `migrate` applies them, `generate --custom` creates empty migration files for raw SQL (FTS5). |
| Zod | 3.x | Schema validation | Shared between API validation and frontend. Single validation library everywhere. |
| nanoid | 5.1+ | ID generation | 21-char URL-safe unique IDs. Shorter than UUID. ESM-only (Node 22 handles this natively). |
| simple-git | 3.32+ | Git operations | Promise-based git command wrapper. Status, log, branch info. 7K+ npm dependents. TypeScript types included. |

### Frontend (Scaffold Only in Phase 1)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | Production-ready with compiler auto-memoization. Largest ecosystem. Already known from TaxNav. |
| Vite | 6.x | Build tool + dev server | Fastest DX for React SPAs. HMR in milliseconds. Simple config. |
| TanStack Query | 5.x | Server state management | SWR caching, background refetching. Pairs with Hono RPC for type-safe data fetching. |
| Tailwind CSS | 4.x | Styling | CSS-first config in v4, no JS config file. One-line setup: `@import "tailwindcss"`. |
| @tailwindcss/vite | latest | Vite integration | First-party Tailwind v4 Vite plugin. |

### Dev & Testing

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 3.x | Test runner | Vite-native, TypeScript-first. `projects` config for monorepo (replaces deprecated workspace). |
| TypeScript | 5.7+ | Language | Strict mode. ES2022 target. NodeNext module resolution. |
| pnpm | 9.x | Package manager | Already in use. Workspace support. Strict dependency resolution. |
| Turborepo | 2.x | Build orchestrator | Already in use. Task caching, parallel execution. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| simple-git | child_process.execFile + git CLI directly | simple-git wraps git commands with typed responses; raw child_process is lighter but requires manual parsing. Either works -- simple-git saves boilerplate. |
| nanoid | crypto.randomUUID() | UUID is 36 chars vs nanoid's 21. nanoid is URL-safe and shorter. For capture IDs that may appear in URLs, nanoid is preferable. |
| Drizzle custom migrations for FTS5 | Raw SQL at startup | Custom migrations are versioned and reproducible; startup SQL is simpler but not tracked. Migrations are the professional choice. |
| better-sqlite3 | libsql (Turso) | libsql adds a server layer. Pure better-sqlite3 is simpler for single-process, single-file. If replication is ever needed, libsql is a drop-in replacement. |

**Installation (API package):**
```bash
pnpm add hono @hono/node-server @hono/zod-validator zod drizzle-orm better-sqlite3 nanoid simple-git
pnpm add -D drizzle-kit @types/better-sqlite3 vitest typescript
```

**Installation (Web package):**
```bash
pnpm add react react-dom @tanstack/react-query
pnpm add -D @vitejs/plugin-react vite tailwindcss @tailwindcss/vite typescript
```

**Installation (Shared package):**
```bash
pnpm add zod
pnpm add -D typescript
```

## Architecture Patterns

### Recommended Project Structure

```
mission-control/
  .planning/                  # Preserved -- GSD state
  packages/
    api/                      # Hono API server
      src/
        index.ts              # Entry point: serve() + static files
        app.ts                # Hono app definition, route registration
        routes/
          health.ts           # GET /api/health
          captures.ts         # CRUD /api/captures
          projects.ts         # GET /api/projects, /api/projects/:slug
          search.ts           # GET /api/search?q=
        db/
          index.ts            # Database connection (better-sqlite3 + Drizzle)
          schema.ts           # Drizzle table definitions
          queries/            # Query functions grouped by domain
            captures.ts
            projects.ts
            search.ts
        services/
          project-scanner.ts  # Git status, commits, GSD state from local repos
          cache.ts            # In-memory TTL cache for scan results
        lib/
          errors.ts           # Typed error classes
          config.ts           # mc.config.json loader
      drizzle/                # Migration SQL files (generated by drizzle-kit)
      drizzle.config.ts       # Drizzle Kit config
      package.json
      tsconfig.json
      vitest.config.ts
    web/                      # React SPA (scaffold only in Phase 1)
      src/
        main.tsx              # React entry point
        App.tsx               # Root component
        api/
          client.ts           # Hono RPC client (hc<AppType>)
      index.html
      vite.config.ts
      package.json
      tsconfig.json
    shared/                   # Shared types and schemas
      src/
        index.ts              # Barrel export
        schemas/
          capture.ts          # Zod schemas for captures
          project.ts          # Zod schemas for projects
          api.ts              # API request/response shapes
        types/
          index.ts            # TypeScript types derived from schemas
      package.json
      tsconfig.json
  mc.config.example.json      # Checked in -- shows config shape
  package.json                # Root workspace config
  pnpm-workspace.yaml         # packages/*
  turbo.json                  # Task definitions
  tsconfig.base.json          # Shared compiler options
```

### Pattern 1: Hono API with Node.js Static File Serving

**What:** The Hono API server serves both API routes (`/api/*`) and the Vite-built React SPA (static files + SPA fallback).

**When:** Always for production. In development, Vite dev server runs separately.

**Example:**
```typescript
// packages/api/src/index.ts
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { app } from './app';

// API routes are registered in app.ts
// In production, also serve the React SPA
if (process.env.NODE_ENV === 'production') {
  // Serve Vite build output
  app.use('/assets/*', serveStatic({ root: '../web/dist' }));
  app.use('/*', serveStatic({ root: '../web/dist', path: 'index.html' }));
}

const port = parseInt(process.env.PORT ?? '3000', 10);
const server = serve({ fetch: app.fetch, port });
console.log(`Mission Control API running on port ${port}`);

// Graceful shutdown
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => { server.close(); process.exit(0); });
```

### Pattern 2: Drizzle Schema + FTS5 via Custom Migration

**What:** Regular tables are defined in Drizzle schema (source of truth). FTS5 virtual tables are created via custom migration SQL files. FTS5 tables are NOT defined in the Drizzle schema to avoid `drizzle-kit push` conflicts.

**When:** Always for FTS5. Drizzle has no native virtual table support.

**Example:**
```typescript
// packages/api/src/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const captures = sqliteTable('captures', {
  id: text('id').primaryKey(),                // nanoid
  rawContent: text('raw_content').notNull(),
  type: text('type', { enum: ['text', 'voice', 'link', 'image'] }).notNull().default('text'),
  status: text('status', { enum: ['raw', 'pending_enrichment', 'enriched', 'archived'] }).notNull().default('raw'),
  projectId: text('project_id'),              // nullable -- unlinked captures
  userId: text('user_id'),                    // nullable -- future multi-user
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const projects = sqliteTable('projects', {
  slug: text('slug').primaryKey(),            // e.g. 'efb-212'
  name: text('name').notNull(),
  tagline: text('tagline'),
  path: text('path').notNull(),               // filesystem path
  host: text('host', { enum: ['local', 'mac-mini'] }).notNull().default('local'),
  lastScannedAt: integer('last_scanned_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
```

```sql
-- drizzle/0001_fts5_search.sql (custom migration)
CREATE VIRTUAL TABLE IF NOT EXISTS captures_fts USING fts5(
  raw_content,
  content='captures',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync with captures table
CREATE TRIGGER IF NOT EXISTS captures_ai AFTER INSERT ON captures BEGIN
  INSERT INTO captures_fts(rowid, raw_content) VALUES (new.rowid, new.raw_content);
END;

CREATE TRIGGER IF NOT EXISTS captures_ad AFTER DELETE ON captures BEGIN
  INSERT INTO captures_fts(captures_fts, rowid, raw_content) VALUES('delete', old.rowid, old.raw_content);
END;

CREATE TRIGGER IF NOT EXISTS captures_au AFTER UPDATE ON captures BEGIN
  INSERT INTO captures_fts(captures_fts, rowid, raw_content) VALUES('delete', old.rowid, old.raw_content);
  INSERT INTO captures_fts(rowid, raw_content) VALUES (new.rowid, new.raw_content);
END;
```

**Critical detail:** FTS5 content tables use `content='captures'` to reference the main table. The `content_rowid='rowid'` maps to SQLite's implicit rowid. Triggers keep the FTS index synchronized automatically on insert/update/delete.

### Pattern 3: Hono RPC for Type-Safe Frontend

**What:** Export the Hono app type from the API package. The web package imports it and creates a type-safe client using `hc<AppType>`.

**When:** For all frontend-to-API communication.

**Key requirement:** Both packages must use the same Hono version. In the monorepo, use a shared workspace dependency.

**Example:**
```typescript
// packages/api/src/app.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const app = new Hono()
  .get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))
  .get('/api/captures', (c) => {
    // ... query captures
    return c.json({ captures: [] });
  })
  .post('/api/captures',
    zValidator('json', z.object({
      content: z.string().min(1).max(10000),
      type: z.enum(['text', 'voice', 'link', 'image']).default('text'),
      clientId: z.string().optional(),
      userId: z.string().optional(),
    })),
    (c) => {
      const body = c.req.valid('json');
      // ... insert capture
      return c.json({ capture: {} }, 201);
    }
  );

export type AppType = typeof app;
export { app };
```

```typescript
// packages/web/src/api/client.ts
import { hc } from 'hono/client';
import type { AppType } from '@mission-control/api';

export const client = hc<AppType>(
  import.meta.env.DEV ? 'http://localhost:3000' : ''
);
```

**Monorepo TypeScript setup:** The web package's tsconfig.json needs `"references": [{ "path": "../api" }]` and the API package needs `"composite": true` in its tsconfig for proper type sharing.

### Pattern 4: Project Scanner with TTL Cache

**What:** Scan local git repos using child_process (or simple-git) with results cached in-memory with a 30-60 second TTL. Background poll refreshes the cache every 5-10 minutes. API endpoints read from cache for fast responses.

**When:** For all project data (git status, commits, GSD state).

**Reference implementation:** The portfolio-dashboard Python project uses exactly this pattern -- `asyncio.create_subprocess_shell` for git commands, dict-based TTL cache, parallel scanning of multiple repos.

**Example:**
```typescript
// packages/api/src/services/project-scanner.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const exec = promisify(execFile);

interface GitStatus {
  branch: string;
  dirty: boolean;
  dirtyFiles: string[];
  lastCommitHash: string;
  lastCommitMessage: string;
  lastCommitTime: string;
}

async function getGitStatus(repoPath: string): Promise<GitStatus> {
  const opts = { cwd: repoPath, timeout: 10000 };
  const [branchResult, statusResult, logResult] = await Promise.all([
    exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts),
    exec('git', ['status', '--porcelain'], opts),
    exec('git', ['log', '-1', '--format=%h|%s|%ar'], opts),
  ]);

  const dirtyFiles = statusResult.stdout.split('\n').filter(l => l.trim());
  const [hash = '', message = '', time = ''] = logResult.stdout.trim().split('|', 3);

  return {
    branch: branchResult.stdout.trim() || 'unknown',
    dirty: dirtyFiles.length > 0,
    dirtyFiles: dirtyFiles.map(f => f.trim()),
    lastCommitHash: hash,
    lastCommitMessage: message,
    lastCommitTime: time,
  };
}
```

### Pattern 5: API Response Conventions

**Recommendation (Claude's Discretion area):**

```typescript
// Success responses: unwrapped data at top level
{ "captures": [...] }
{ "capture": {...} }
{ "projects": [...] }

// Error responses: consistent error shape
{ "error": { "code": "NOT_FOUND", "message": "Capture not found" } }
{ "error": { "code": "VALIDATION_ERROR", "message": "Content is required", "details": [...] } }

// Health check
{ "status": "ok", "timestamp": 1710000000000, "version": "1.0.0" }
```

No pagination in v1 (12 projects, likely <100 captures in early use). No envelope wrapper. Clean and simple. Add pagination when data volume demands it.

### Anti-Patterns to Avoid

- **Defining FTS5 tables in Drizzle schema:** Using `sqliteTable` for FTS5 virtual tables causes `drizzle-kit push` to create a regular table that shadows the virtual table. FTS5 tables must be created via custom migrations or raw SQL at database initialization.
- **Using `drizzle-kit push` in production:** Push applies changes directly without versioned migration files. Use `generate` + `migrate` for reproducible, tracked schema changes.
- **Running git commands without timeout:** Git operations on large repos or network-mounted paths can hang. Always set a timeout (10s for local, 15s for remote).
- **Polling without cache:** Scanning 12+ repos every request would add seconds of latency. Cache scan results and refresh on a timer or explicit API call.
- **Mixing Hono versions across packages:** The web package imports `AppType` from the API package. If Hono versions differ, the RPC client type inference breaks silently. Pin to the same version in both packages.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search | Custom search indexer or tokenizer | SQLite FTS5 (built-in) | FTS5 handles tokenization, stemming, BM25 ranking, phrase queries. Rolling your own is months of work for worse results. |
| Git repo status | Custom git file parsing | simple-git or child_process + git CLI | Git's porcelain output format is stable across versions and purpose-built for machine parsing. |
| ID generation | Custom random string functions | nanoid | Cryptographically strong, collision-resistant, URL-safe. 21 chars = 126 bits of entropy. |
| Schema migrations | Manual SQL scripts or startup DDL | Drizzle Kit (generate + migrate) | Versioned, ordered, reproducible. Custom migrations handle FTS5. Drizzle tracks applied migrations. |
| Request validation | Manual if/else checking | @hono/zod-validator (zValidator) | Validates + types in one step. Integrates with Hono RPC for end-to-end type safety. |
| HTTP server | Raw http.createServer | @hono/node-server | Handles request/response translation, static files, graceful shutdown. |

**Key insight:** The entire data layer (SQLite + FTS5 + WAL) is built into SQLite. No external search service, no separate database server, no connection pool. One file, one process, zero ops.

## Common Pitfalls

### Pitfall 1: FTS5 Sync Drift
**What goes wrong:** The FTS5 index gets out of sync with the main captures table when inserts/updates/deletes bypass the triggers (e.g., direct SQL commands, bulk operations, or schema migrations that recreate tables).
**Why it happens:** FTS5 content tables are external content tables -- they reference the main table but don't have automatic integrity enforcement beyond the triggers you create.
**How to avoid:** Always use the Drizzle ORM query methods for CRUD (which fire triggers). Add a `REBUILD` endpoint: `INSERT INTO captures_fts(captures_fts) VALUES('rebuild')` to force a full re-index. Run this after any migration that touches the captures table.
**Warning signs:** Search returns stale results or misses recently created captures.

### Pitfall 2: better-sqlite3 Native Extension on Apple Silicon
**What goes wrong:** better-sqlite3 requires a native binary compiled for the target architecture. On Apple Silicon Macs, the prebuilt binary may fail to load if the wrong architecture is installed (e.g., x86_64 via Rosetta node).
**Why it happens:** Node.js installed via certain methods (e.g., Homebrew under Rosetta) may compile native extensions for x86_64 instead of arm64.
**How to avoid:** Ensure Node.js is the arm64 build (check with `node -p process.arch` -- should print `arm64`). If installation fails, run `npm rebuild better-sqlite3` to recompile from source. Current Node v22.17.1 on the development machine is confirmed working.
**Warning signs:** `Error: Could not locate the bindings file` at startup.

### Pitfall 3: Drizzle + FTS5 Push Conflict
**What goes wrong:** Running `drizzle-kit push` after defining an FTS5 virtual table tries to create a regular table with the same name, destroying the virtual table.
**Why it happens:** Drizzle Kit doesn't understand virtual tables. It sees a table name in the migration history and tries to manage it.
**How to avoid:** Never define FTS5 tables in the Drizzle schema file. Create them exclusively via custom migration files (`drizzle-kit generate --custom`). Only use `drizzle-kit migrate` (not `push`) to apply changes.
**Warning signs:** FTS5 queries fail with "no such table" after a push operation.

### Pitfall 4: Hono RPC Type Leaking Across Packages
**What goes wrong:** The Hono RPC type export (`AppType`) doesn't work across monorepo packages -- the frontend sees `any` instead of typed routes.
**Why it happens:** TypeScript project references require `composite: true` in the referenced project's tsconfig and explicit `references` in the consuming project. Without this, TypeScript can't resolve cross-package types.
**How to avoid:** Set `"composite": true` in `packages/api/tsconfig.json`. Add `"references": [{ "path": "../api" }]` in `packages/web/tsconfig.json`. Ensure identical Hono versions in both packages.
**Warning signs:** No autocomplete on `client.api.*` calls in the web package.

### Pitfall 5: WAL Mode Not Persisting
**What goes wrong:** SQLite journal mode is set to WAL in application code, but some operations (like drizzle-kit migrations run in a separate process) may use a fresh connection without WAL.
**Why it happens:** WAL mode is persistent at the database file level once set. However, if the database file is recreated (e.g., deleted and re-created during development), the mode resets to DELETE.
**How to avoid:** Set WAL mode immediately after creating the better-sqlite3 Database instance: `sqlite.pragma("journal_mode = WAL")`. Also set in a migration or initialization script. WAL persists across connections once set on a database file.
**Warning signs:** `PRAGMA journal_mode` returns `delete` instead of `wal`.

### Pitfall 6: Git Command Failures Blocking API Responses
**What goes wrong:** A git command hangs (network repo, corrupted index, large repo) and blocks the API response because the scan runs synchronously in the request handler.
**Why it happens:** Even with promisified execFile, a hanging git process ties up the handler until timeout.
**How to avoid:** Never run git scans inline with API requests. Always read from the in-memory cache. The cache is populated by: (1) background poll timer (every 5-10 min), and (2) explicit refresh API endpoint that runs the scan asynchronously. API endpoints return cached data only, with a `lastScannedAt` timestamp so the client knows freshness.
**Warning signs:** API responses take >1 second for project endpoints.

## Code Examples

### Database Initialization
```typescript
// packages/api/src/db/index.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'mission-control.db');

// Ensure data directory exists
import { mkdirSync } from 'node:fs';
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);

// Performance pragmas
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('cache_size = -64000');   // 64MB cache
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// Run migrations on startup
migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../drizzle') });
```

### FTS5 Search Query
```typescript
// packages/api/src/db/queries/search.ts
import { sql } from 'drizzle-orm';
import { db } from '../index';

export function searchCaptures(query: string, limit = 20) {
  // FTS5 match with BM25 ranking
  // Weight: raw_content gets full weight
  const results = db.all(sql`
    SELECT
      c.id,
      c.raw_content,
      c.type,
      c.project_id,
      c.created_at,
      bm25(captures_fts, 1.0) AS rank
    FROM captures_fts
    JOIN captures c ON captures_fts.rowid = c.rowid
    WHERE captures_fts MATCH ${query}
    ORDER BY rank
    LIMIT ${limit}
  `);
  return results;
}
```

### Config File Loader
```typescript
// packages/api/src/lib/config.ts
import { readFileSync, existsSync } from 'node:fs';
import { z } from 'zod';
import path from 'node:path';

const ProjectEntrySchema = z.object({
  name: z.string(),
  slug: z.string(),
  path: z.string(),
  host: z.enum(['local', 'mac-mini']).default('local'),
  tagline: z.string().optional(),
});

const ConfigSchema = z.object({
  projects: z.array(ProjectEntrySchema),
  macMiniHost: z.string().default('mac-mini-host'),
  dataDir: z.string().default('./data'),
});

export type MCConfig = z.infer<typeof ConfigSchema>;

const CONFIG_PATH = process.env.MC_CONFIG_PATH
  ?? path.join(process.cwd(), 'mc.config.json');

export function loadConfig(): MCConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Config file not found: ${CONFIG_PATH}. Copy mc.config.example.json and edit.`);
  }
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  return ConfigSchema.parse(raw);
}
```

### Hono App with Route Registration
```typescript
// packages/api/src/app.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/middleware';
import { healthRoutes } from './routes/health';
import { captureRoutes } from './routes/captures';
import { projectRoutes } from './routes/projects';
import { searchRoutes } from './routes/search';

const app = new Hono()
  .use('*', logger())
  .use('/api/*', cors())
  .route('/api', healthRoutes)
  .route('/api', captureRoutes)
  .route('/api', projectRoutes)
  .route('/api', searchRoutes);

export type AppType = typeof app;
export { app };
```

### TTL Cache Implementation
```typescript
// packages/api/src/services/cache.ts
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  constructor(private ttlMs: number = 30_000) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, { data, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express.js | Hono 4.x | 2024-2025 adoption surge | 2-3x faster, native TS, built-in RPC, Web Standards API |
| Prisma | Drizzle ORM | 2024-2025 | Lighter, faster queries, SQL-like API, better SQLite support |
| ESLint + Prettier | Biome (optional) | 2024-2025 | 10-100x faster, single tool. Not strictly required for Phase 1. |
| Tailwind v3 (JS config) | Tailwind v4 (CSS-first) | Jan 2025 | No `tailwind.config.js` needed. `@import "tailwindcss"` in CSS. Rust engine = 5x faster. |
| nanoid v3 (CJS) | nanoid v5 (ESM-only) | 2024 | Must use ESM imports. Node 22+ handles this natively. |
| Vitest workspace | Vitest projects | Vitest 3.2 (2025) | `projects` config array in root vitest.config.ts replaces deprecated workspace file |
| pnpm 8 | pnpm 9 | 2024 | Stricter peer dependency resolution. Update packageManager field in root package.json. |

**Deprecated/outdated:**
- Express.js: Legacy, slow, no native TypeScript
- Prisma: Heavier, slower for SQLite, generates client code
- Convex (existing in repo): Hosted service, wrong model for self-hosted single-user

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | Root `vitest.config.ts` with `projects: ['packages/*']` |
| Quick run command | `pnpm --filter api test` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | Health endpoint returns JSON | integration | `pnpm --filter api test -- --grep "health"` | Wave 0 |
| FOUND-02 | Captures CRUD persists across test runs | integration | `pnpm --filter api test -- --grep "captures"` | Wave 0 |
| FOUND-03 | FTS5 search returns ranked results | integration | `pnpm --filter api test -- --grep "search"` | Wave 0 |
| FOUND-04 | All API endpoints exist and validate input | integration | `pnpm --filter api test -- --grep "routes"` | Wave 0 |
| FOUND-05 | Project scanner returns git status data | unit | `pnpm --filter api test -- --grep "scanner"` | Wave 0 |
| PLAT-01 | Dashboard fetches all data via API | smoke | Manual -- verify web package has no direct DB access | N/A |
| PLAT-02 | API accepts userId parameter | integration | `pnpm --filter api test -- --grep "userId"` | Wave 0 |
| PLAT-03 | API binds to configurable host/port | unit | `pnpm --filter api test -- --grep "config"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter api test`
- **Per wave merge:** `pnpm test` (all packages)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/vitest.config.ts` -- test config with SQLite in-memory or temp file
- [ ] `packages/api/src/__tests__/routes/health.test.ts` -- health endpoint test
- [ ] `packages/api/src/__tests__/routes/captures.test.ts` -- CRUD integration tests
- [ ] `packages/api/src/__tests__/routes/search.test.ts` -- FTS5 search tests
- [ ] `packages/api/src/__tests__/services/project-scanner.test.ts` -- scanner unit tests
- [ ] `packages/api/src/__tests__/helpers/setup.ts` -- test database setup/teardown helper
- [ ] Root `vitest.config.ts` with `projects` array for monorepo

## Open Questions

1. **Project metadata: config file vs SQLite?**
   - What we know: mc.config.json defines project paths and hosts. Portfolio-dashboard uses the same pattern (~/.portfolio.json).
   - What's unclear: Should project metadata (tagline, display name) live in config or SQLite?
   - Recommendation: Store the project registry in mc.config.json (source of truth for paths/hosts). On startup and each scan, upsert project records into SQLite with scanned metadata (git branch, last commit, dirty status). Taglines can be stored in either -- SQLite allows API-driven updates without editing config. **Use both: config for discovery, SQLite for enriched state.**

2. **simple-git vs raw child_process?**
   - What we know: simple-git is well-maintained (3.32+, 7K dependents). Portfolio-dashboard uses raw subprocess calls.
   - What's unclear: Whether simple-git's async-by-default behavior fits well with the synchronous better-sqlite3 pattern.
   - Recommendation: **Use raw child_process.execFile** to match the proven portfolio-dashboard pattern and avoid an extra dependency. The git commands needed are simple (`status --porcelain`, `log -N --format=...`, `rev-parse --abbrev-ref HEAD`) and don't benefit from simple-git's abstraction. This keeps the scanner lightweight and consistent with the reference implementation.

3. **pnpm version upgrade (8 -> 9)?**
   - What we know: Root package.json specifies `pnpm@8.15.0`. pnpm 9.x is current.
   - What's unclear: Whether any scripts depend on pnpm 8-specific behavior.
   - Recommendation: **Upgrade to pnpm 9.x** during the repo wipe. Since all old packages are being deleted, there are no backward compatibility concerns. Update the `packageManager` field in root package.json.

## Sources

### Primary (HIGH confidence)
- [Hono Node.js Getting Started](https://hono.dev/docs/getting-started/nodejs) -- Server setup, static files, port config
- [Hono RPC Guide](https://hono.dev/docs/guides/rpc) -- Type-safe client, AppType export, monorepo setup
- [Hono Validation Guide](https://hono.dev/docs/guides/validation) -- zValidator middleware, Zod integration
- [@hono/node-server GitHub](https://github.com/honojs/node-server) -- Static file serving, serveStatic configuration
- [Drizzle ORM SQLite Setup](https://orm.drizzle.team/docs/get-started/sqlite-new) -- better-sqlite3 driver, schema definition, migrations
- [Drizzle Custom Migrations](https://orm.drizzle.team/docs/kit-custom-migrations) -- `generate --custom` for raw SQL migration files
- [SQLite FTS5 Extension](https://sqlite.org/fts5.html) -- Virtual table syntax, BM25 ranking, content tables, triggers
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) -- API docs, pragma support, Apple Silicon compatibility
- [nanoid GitHub](https://github.com/ai/nanoid) -- v5.1.6, ESM-only, 21-char URL-safe IDs

### Secondary (MEDIUM confidence)
- [Serving Vite + React with Hono](https://knathanael.com/posts/hono_serve_vite_react/) -- SPA fallback pattern with serveStatic
- [Hono RPC in Monorepos](https://catalins.tech/hono-rpc-in-monorepos/) -- TypeScript project references for cross-package type sharing
- [Drizzle ORM FTS5 Discussion](https://www.answeroverflow.com/m/1146392232509833256) -- Community guidance on virtual tables with Drizzle
- [Drizzle FTS5 GitHub Issue #2046](https://github.com/drizzle-team/drizzle-orm/issues/2046) -- Feature request tracking virtual table support
- [WAL Mode with Drizzle Issue #4968](https://github.com/drizzle-team/drizzle-orm/issues/4968) -- WAL mode persistence via pragma, not migration files
- [Vitest Projects Config](https://vitest.dev/guide/projects) -- Monorepo test configuration (replaces deprecated workspace)
- [simple-git npm](https://www.npmjs.com/package/simple-git) -- v3.32.3, TypeScript support, 7K dependents
- portfolio-dashboard source code (`~/portfolio-dashboard/src/portfolio_dashboard/`) -- Reference implementation for git scanning, config loading, GSD state parsing

### Tertiary (LOW confidence)
- [better-sqlite3 ARM64 binding issue](https://github.com/ruvnet/claude-flow/issues/360) -- July 2025 report of binding failures on macOS ARM64 (may be resolved in latest release)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries verified against npm registry and official docs. Versions confirmed current. Hono + better-sqlite3 + Drizzle is well-established.
- Architecture: HIGH -- Monorepo structure follows pnpm + Turborepo best practices. Hono RPC pattern documented officially. FTS5 approach validated against Drizzle community and SQLite docs.
- Pitfalls: HIGH -- FTS5 sync drift, Drizzle push conflict, and RPC type leaking are all documented in official issue trackers. better-sqlite3 ARM64 issues are confirmed but solvable.
- Project scanning: HIGH -- Portfolio-dashboard provides a working reference implementation in Python. The Node.js equivalent using child_process is straightforward.

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable stack, 30-day validity)
