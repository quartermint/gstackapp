# Phase 1: Foundation & GitHub Integration - Research

**Researched:** 2026-03-30
**Domain:** Monorepo scaffold, SQLite database schema, GitHub App webhook handling, installation token management, Tailscale Funnel ingress
**Confidence:** HIGH

## Summary

Phase 1 is pure infrastructure -- no AI, no dashboard, no frontend beyond a health check. The work breaks into four clear domains: (1) npm workspaces monorepo with TypeScript project references, (2) Drizzle ORM schema for 6 tables with SQLite WAL mode, (3) GitHub App webhook ingress with Octokit signature verification and idempotency, and (4) installation token management with auto-refresh via `@octokit/auth-app`. All libraries are verified, stable, and well-documented. The primary technical risk is getting webhook signature verification right on the first commit -- Hono's body consumption semantics require careful handling.

The existing project research (ARCHITECTURE.md, STACK.md, PITFALLS.md) already covers the full system architecture. This phase research focuses specifically on the implementation details, API patterns, and gotchas for the Phase 1 scope.

**Primary recommendation:** Build in strict dependency order: monorepo scaffold -> database schema -> GitHub auth module -> webhook handler -> Tailscale Funnel. Each layer depends on the previous. The webhook handler is the integration point where everything connects -- signature verification, idempotency, event filtering, and async pipeline dispatch.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** npm workspaces monorepo with `packages/api` (Hono backend), `packages/web` (React frontend), `packages/shared` (Zod schemas, types)
- **D-02:** Shared Zod schemas in `packages/shared` -- StageResult, Finding, Verdict types used by both API and frontend
- **D-03:** 6 tables: github_installations, repositories, pull_requests, pipeline_runs, stage_results, findings
- **D-04:** SQLite with WAL mode enabled from first migration (concurrent reads during pipeline execution)
- **D-05:** busy_timeout configured to prevent silent write drops
- **D-06:** Drizzle ORM with schema-as-code, drizzle-kit for migrations
- **D-07:** X-GitHub-Delivery header as idempotency key -- UNIQUE constraint, INSERT ON CONFLICT DO NOTHING
- **D-08:** ACK within 2 seconds (not just 10) -- process pipeline async in-process
- **D-09:** Subscribe to: pull_request (opened, synchronize, reopened), installation (created, deleted), installation_repositories (added, removed)
- **D-10:** @octokit/webhooks for signature verification, @octokit/auth-app for installation tokens
- **D-11:** Read: contents, metadata, pull_requests. Write: pull_requests (for comments and reviews)
- **D-12:** smee.io proxy for integration testing with real GitHub webhooks
- **D-13:** Captured webhook payload fixtures for unit tests and CI (no live GitHub dependency)
- **D-14:** Vitest with Hono testClient for API endpoint testing
- **D-15:** Tailscale Funnel for webhook ingress on Mac Mini
- **D-16:** Startup reconciliation: detect stale RUNNING pipelines on process start, mark as STALE

### Claude's Discretion
- Exact npm workspace configuration
- Dev server setup (concurrent API + web dev servers)
- ESLint/Prettier configuration
- GitHub App manifest details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GHUB-01 | User can install GitHub App on their account and select repositories | GitHub App registration, installation webhook handler (D-09), github_installations + repositories tables (D-03) |
| GHUB-02 | App receives PR webhooks on open, synchronize (push), and reopen events | Webhook handler with @octokit/webhooks (D-10), event filtering (D-09), signature verification, smee.io dev proxy (D-12) |
| GHUB-03 | App creates and refreshes installation access tokens for API calls | @octokit/auth-app with auto-refresh (D-10), Octokit client factory pattern |
| GHUB-04 | Force-push to a PR triggers a new pipeline run (re-renders comment from latest) | synchronize event handling (D-09), pipeline_runs table with head_sha tracking (D-03) |
| GHUB-05 | Webhook handler ACKs within 10 seconds and processes pipeline async | Fast ACK pattern (D-08, 2s target), in-process async dispatch, idempotency via X-GitHub-Delivery (D-07) |
</phase_requirements>

## Standard Stack

### Core (Phase 1 Scope)

| Library | Verified Version | Purpose | Why Standard |
|---------|-----------------|---------|--------------|
| hono | 4.12.9 | HTTP server, routing, webhook endpoint | Web Standards-based, built-in SSE, ultrafast. Proven in MC stack. |
| @hono/node-server | 1.19.12 | Node.js adapter | Required for Mac Mini deployment. Translates Web Standard Request/Response to Node HTTP. |
| better-sqlite3 | 12.8.0 | SQLite driver | Synchronous API, fastest Node.js SQLite driver. WAL mode for concurrent reads. |
| drizzle-orm | 0.45.2 | Type-safe ORM | SQL-like builder with TypeScript inference. First-class better-sqlite3 driver. |
| drizzle-kit | 0.31.10 | Migrations CLI | Schema push, migration generation, Drizzle Studio. |
| @octokit/webhooks | 14.2.0 | Webhook verification + event routing | Type-safe event handling, built-in HMAC-SHA256 signature verification. |
| @octokit/rest | 22.0.1 | GitHub REST API client | PR comments, metadata, file listing. Installation-scoped auth. |
| @octokit/auth-app | 8.2.0 | GitHub App authentication | JWT generation, installation token auto-refresh (caches up to 15K tokens). |
| zod | 4.3.6 | Runtime validation + types | Shared schemas between API and frontend. Hono validator integration. |
| tsx | 4.21.0 | TypeScript execution | Run TS directly in Node.js. Dev server, scripts, seed data. |
| vitest | 4.1.2 | Testing | Vite-native, Hono testClient support, fast parallel execution. |

**Note on Zod 4:** npm shows zod@4.3.6 as latest. Zod 4 was released recently. The STACK.md recommends ^3.24 for stability. Recommendation: use Zod 3.24.x for Phase 1 stability (well-tested with Hono, Drizzle, and Anthropic SDK). Migration to Zod 4 can happen in a future phase. Install with `zod@^3.24`.

### Supporting (Phase 1 Scope)

| Library | Verified Version | Purpose | When to Use |
|---------|-----------------|---------|-------------|
| dotenv | 17.3.1 | Environment variables | Loading GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET from .env |
| nanoid | 5.1.7 | ID generation | Short URL-safe IDs for pipeline runs, internal identifiers |
| pino | 10.3.1 | Structured logging | JSON logs for webhook events, auth token refresh, errors |
| smee-client | 5.0.0 | Webhook proxy for local dev | Forward GitHub webhooks from smee.io to localhost during development |
| @types/better-sqlite3 | 7.6.13 | TypeScript types | Type definitions for better-sqlite3 |

### Dev Dependencies

| Library | Purpose |
|---------|---------|
| @types/node | Node.js type definitions |
| typescript | TypeScript compiler (for type checking, not runtime) |

**Installation (Phase 1 only):**
```bash
# Root: initialize workspaces
mkdir -p packages/api packages/web packages/shared

# API package
cd packages/api && npm init -y && cd ../..
npm install -w packages/api hono @hono/node-server better-sqlite3 drizzle-orm @octokit/webhooks @octokit/rest @octokit/auth-app zod@^3.24 pino nanoid dotenv
npm install -w packages/api -D drizzle-kit @types/better-sqlite3 tsx vitest @types/node typescript

# Web package (minimal for Phase 1 -- just a placeholder)
cd packages/web && npm init -y && cd ../..

# Shared package
cd packages/shared && npm init -y && cd ../..
npm install -w packages/shared zod@^3.24
npm install -w packages/shared -D typescript

# Dev tool (root level)
npm install -D smee-client
```

## Architecture Patterns

### Recommended Project Structure (Phase 1)

```
gstackapp/
  package.json                 # workspaces: ["packages/*"]
  tsconfig.json                # Base TS config with project references
  .env                         # GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET
  .env.example                 # Template (no secrets)
  drizzle.config.ts            # Drizzle-kit config pointing to packages/api/src/db/schema.ts
  packages/
    api/
      package.json
      tsconfig.json            # Extends root, references shared
      src/
        index.ts               # Hono app entry + @hono/node-server serve()
        db/
          schema.ts            # Drizzle schema (6 tables)
          client.ts            # Database connection + WAL mode + busy_timeout
          migrations/           # Drizzle-generated migrations
        github/
          auth.ts              # createAppAuth factory, getInstallationOctokit()
          webhook.ts           # Hono route: signature verify + event routing
          handlers.ts          # Event handlers: installation, pull_request
        routes/
          health.ts            # GET /health (uptime, last webhook timestamp)
        lib/
          config.ts            # Validated env config via Zod
          idempotency.ts       # X-GitHub-Delivery dedup logic
    web/
      package.json             # Minimal placeholder for Phase 1
      tsconfig.json
    shared/
      package.json
      tsconfig.json
      src/
        index.ts               # Re-export all schemas
        schemas/
          verdicts.ts          # Verdict enum: PASS, FLAG, BLOCK, SKIP
          pipeline.ts          # PipelineRun, StageResult Zod schemas
          findings.ts          # Finding schema with severity tiers
          github.ts            # Installation, Repository schemas
```

### Pattern 1: Webhook Fast-ACK with Raw Body Verification

**What:** Read raw body first, verify HMAC signature, ACK immediately, dispatch async processing.

**Critical Hono Detail:** In Hono (v4+), `c.req.text()` returns the body and caches it internally. You MUST call `c.req.text()` BEFORE any `c.req.json()` call to preserve the raw text for signature verification. If JSON parsing middleware runs first, the raw body is consumed. The webhook route should NOT use global JSON parsing middleware.

**Example:**
```typescript
// packages/api/src/github/webhook.ts
import { Hono } from 'hono'
import { Webhooks } from '@octokit/webhooks'

const webhookApp = new Hono()

// CRITICAL: Do NOT use bodyLimit or json middleware on this route
webhookApp.post('/api/webhook', async (c) => {
  const webhooks = new Webhooks({ secret: config.githubWebhookSecret })

  // 1. Read raw body FIRST (before any JSON parsing)
  const rawBody = await c.req.text()

  // 2. Extract GitHub headers
  const deliveryId = c.req.header('x-github-delivery')
  const signature = c.req.header('x-hub-signature-256')
  const eventName = c.req.header('x-github-event')

  if (!deliveryId || !signature || !eventName) {
    return c.json({ error: 'Missing required GitHub headers' }, 400)
  }

  // 3. Verify and dispatch (verifyAndReceive handles HMAC check)
  try {
    await webhooks.verifyAndReceive({
      id: deliveryId,
      name: eventName as any,
      signature,
      payload: rawBody, // Raw string, NOT parsed JSON
    })
  } catch (err) {
    return c.json({ error: 'Signature verification failed' }, 401)
  }

  // 4. Fast ACK -- event handlers run async
  return c.json({ ok: true })
})
```

**Key insight:** `@octokit/webhooks` `verifyAndReceive()` accepts the payload as a string and handles JSON parsing internally. Do NOT pass parsed JSON -- pass the raw text.

### Pattern 2: Idempotency via X-GitHub-Delivery

**What:** Use the delivery ID as a UNIQUE constraint in the database. INSERT ON CONFLICT DO NOTHING for atomic dedup. Never query-then-insert (race condition).

**Example:**
```typescript
// packages/api/src/lib/idempotency.ts
import { db } from '../db/client'
import { pipelineRuns } from '../db/schema'
import { sql } from 'drizzle-orm'

export async function tryCreatePipelineRun(
  deliveryId: string,
  prId: number,
  installationId: number,
  headSha: string
): Promise<{ created: boolean; runId: string }> {
  const runId = nanoid()

  // Atomic insert-or-ignore via ON CONFLICT DO NOTHING
  const result = db.run(sql`
    INSERT INTO pipeline_runs (id, delivery_id, pr_id, installation_id, head_sha, status, created_at)
    VALUES (${runId}, ${deliveryId}, ${prId}, ${installationId}, ${headSha}, 'PENDING', ${Date.now()})
    ON CONFLICT (delivery_id) DO NOTHING
  `)

  return {
    created: result.changes > 0,
    runId: result.changes > 0 ? runId : '',
  }
}
```

### Pattern 3: GitHub App Authentication Factory

**What:** Create a single `createAppAuth` instance at startup. Create per-installation Octokit clients on demand with auto-refreshing tokens.

**Example:**
```typescript
// packages/api/src/github/auth.ts
import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'

const appAuth = createAppAuth({
  appId: config.githubAppId,
  privateKey: config.githubPrivateKey,
})

// Cache installation Octokit instances
const installationClients = new Map<number, Octokit>()

export function getInstallationOctokit(installationId: number): Octokit {
  if (!installationClients.has(installationId)) {
    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: config.githubAppId,
        privateKey: config.githubPrivateKey,
        installationId,
      },
    })
    installationClients.set(installationId, octokit)
  }
  return installationClients.get(installationId)!
}
```

**Key insight:** `@octokit/auth-app` internally caches up to 15,000 installation tokens (via toad-cache) and auto-refreshes them before expiration. You do NOT need to implement token refresh logic yourself. Just use the Octokit instance -- it handles auth transparently.

### Pattern 4: Database Schema with WAL Mode

**What:** Configure SQLite WAL mode and busy_timeout as pragmas at connection time, before any queries.

**Example:**
```typescript
// packages/api/src/db/client.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

const sqlite = new Database(config.databasePath)

// CRITICAL: Set pragmas before any operations
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 5000')
sqlite.pragma('synchronous = normal')
sqlite.pragma('cache_size = 10000')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('temp_store = memory')

export const db = drizzle(sqlite, { schema })
```

### Pattern 5: Drizzle Schema for 6 Tables

**What:** Define all 6 tables in a single schema.ts file with proper indexes and constraints. Phase 1 only uses github_installations, repositories, and pull_requests directly. pipeline_runs needs the delivery_id unique index. stage_results and findings are scaffolded but populated in Phase 2.

**Example:**
```typescript
// packages/api/src/db/schema.ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const githubInstallations = sqliteTable('github_installations', {
  id: integer('id').primaryKey(), // GitHub installation ID
  accountLogin: text('account_login').notNull(),
  accountType: text('account_type').notNull(), // 'User' | 'Organization'
  appId: integer('app_id').notNull(),
  status: text('status').notNull().default('active'), // active | suspended | deleted
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
    .$defaultFn(() => new Date()),
})

export const repositories = sqliteTable('repositories', {
  id: integer('id').primaryKey(), // GitHub repo ID
  installationId: integer('installation_id').notNull()
    .references(() => githubInstallations.id),
  fullName: text('full_name').notNull(), // owner/repo
  defaultBranch: text('default_branch').notNull().default('main'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index('repo_installation_idx').on(table.installationId),
])

export const pullRequests = sqliteTable('pull_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repoId: integer('repo_id').notNull()
    .references(() => repositories.id),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  authorLogin: text('author_login').notNull(),
  headSha: text('head_sha').notNull(),
  baseBranch: text('base_branch').notNull(),
  state: text('state').notNull().default('open'), // open | closed | merged
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('pr_repo_number_idx').on(table.repoId, table.number),
])

export const pipelineRuns = sqliteTable('pipeline_runs', {
  id: text('id').primaryKey(), // nanoid
  deliveryId: text('delivery_id').notNull(), // X-GitHub-Delivery
  prId: integer('pr_id').notNull()
    .references(() => pullRequests.id),
  installationId: integer('installation_id').notNull(),
  headSha: text('head_sha').notNull(),
  status: text('status').notNull().default('PENDING'),
    // PENDING | RUNNING | COMPLETED | FAILED | CANCELLED | STALE
  commentId: integer('comment_id'), // GitHub comment ID (set after first post)
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('delivery_id_idx').on(table.deliveryId),
  index('pipeline_pr_idx').on(table.prId),
  index('pipeline_status_idx').on(table.status),
])

export const stageResults = sqliteTable('stage_results', {
  id: text('id').primaryKey(), // nanoid
  pipelineRunId: text('pipeline_run_id').notNull()
    .references(() => pipelineRuns.id),
  stage: text('stage').notNull(), // ceo | eng | design | qa | security
  verdict: text('verdict').notNull().default('PENDING'),
    // PENDING | RUNNING | PASS | FLAG | BLOCK | SKIP
  summary: text('summary'),
  tokenUsage: integer('token_usage'),
  durationMs: integer('duration_ms'),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [
  index('stage_pipeline_idx').on(table.pipelineRunId),
  uniqueIndex('stage_run_stage_idx').on(table.pipelineRunId, table.stage),
])

export const findings = sqliteTable('findings', {
  id: text('id').primaryKey(), // nanoid
  stageResultId: text('stage_result_id').notNull()
    .references(() => stageResults.id),
  pipelineRunId: text('pipeline_run_id').notNull()
    .references(() => pipelineRuns.id),
  severity: text('severity').notNull(), // critical | notable | minor
  category: text('category').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  filePath: text('file_path'),
  lineStart: integer('line_start'),
  lineEnd: integer('line_end'),
  suggestion: text('suggestion'),
  codeSnippet: text('code_snippet'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index('finding_stage_idx').on(table.stageResultId),
  index('finding_pipeline_idx').on(table.pipelineRunId),
  index('finding_severity_idx').on(table.severity),
])
```

### Pattern 6: Startup Reconciliation

**What:** On process start, find all RUNNING/PENDING pipelines and mark them STALE.

**Example:**
```typescript
// packages/api/src/db/reconcile.ts
import { db } from './client'
import { pipelineRuns } from './schema'
import { eq, inArray } from 'drizzle-orm'
import { logger } from '../lib/logger'

export function reconcileStaleRuns() {
  const staleStatuses = ['RUNNING', 'PENDING']
  const updated = db.update(pipelineRuns)
    .set({ status: 'STALE', completedAt: new Date() })
    .where(inArray(pipelineRuns.status, staleStatuses))
    .run()

  if (updated.changes > 0) {
    logger.warn({ count: updated.changes }, 'Marked stale pipeline runs on startup')
  }
}
```

### Anti-Patterns to Avoid

- **Global JSON middleware on webhook route:** Hono's `bodyLimit` or JSON parsing middleware will consume the raw body before signature verification. Keep the webhook route clean.
- **Query-then-insert for idempotency:** Race condition between checking if delivery exists and inserting. Use INSERT ON CONFLICT DO NOTHING atomically.
- **Manual token refresh logic:** `@octokit/auth-app` handles this. Do not build your own token cache or expiration checker.
- **Storing GitHub private key in .env as a single line:** PEM keys are multi-line. Use `\n` escaping or read from a file path. Recommend: store the PEM file path in .env, read the file at startup.
- **Using Probot:** It bundles Express and fights Hono's architecture. Use raw Octokit packages.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature verification | Custom HMAC-SHA256 with crypto | `@octokit/webhooks` `verifyAndReceive()` | Handles timing-safe comparison, SHA256 prefix, and JSON parsing internally |
| Installation token management | Token cache with expiration timers | `@octokit/auth-app` `createAppAuth` | Caches 15K tokens, auto-refreshes at 59 min, thread-safe |
| JWT generation for GitHub App | Manual JWT signing with jsonwebtoken | `@octokit/auth-app` `auth({ type: 'app' })` | Handles RS256 signing, expiration, and caching |
| Database migrations | Raw SQL migration files | `drizzle-kit push` or `drizzle-kit generate` | Schema-as-code, type-safe, diffable |
| Webhook event type routing | Switch statement on event names | `@octokit/webhooks` `.on()` event handlers | Type-safe event names, parallel handler execution |
| TypeScript monorepo linking | Manual symlinks or relative paths | npm workspaces + TypeScript project references | Native resolution, correct type checking |

**Key insight:** The Octokit ecosystem handles 80% of the GitHub integration complexity. The remaining 20% is Hono glue code and database persistence.

## Common Pitfalls

### Pitfall 1: Webhook Body Consumed Before Signature Verification

**What goes wrong:** Hono middleware or a `c.req.json()` call consumes the request body before the webhook handler can read it for HMAC verification. Signature verification silently fails or throws.

**Why it happens:** Hono's request body can only be consumed once from `c.req.raw`. While `c.req.text()` caches on subsequent calls (since Hono 3.5.7+), any prior JSON parsing middleware will consume the body first.

**How to avoid:** (1) Do NOT attach global JSON body parsing middleware to the webhook route. (2) Call `c.req.text()` first in the webhook handler. (3) Pass the raw text string to `webhooks.verifyAndReceive()`. (4) If you need the parsed JSON later, `JSON.parse(rawBody)` after verification.

**Warning signs:** 401 errors from your own webhook handler. GitHub delivery log shows successful delivery but app logs show signature mismatch.

### Pitfall 2: PEM Key Formatting in Environment Variables

**What goes wrong:** The GitHub App private key (PEM format) contains newlines. When stored in `.env` as `GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."`, the `\n` characters are treated as literal backslash-n, not newlines. `@octokit/auth-app` fails with "secretOrPrivateKey must be an asymmetric key" or similar.

**Why it happens:** dotenv does not interpret escape sequences by default.

**How to avoid:** Either (a) store the path to the PEM file: `GITHUB_PRIVATE_KEY_PATH=./private-key.pem` and read with `fs.readFileSync`, or (b) replace `\n` at runtime: `process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n')`. Option (a) is cleaner.

**Warning signs:** Auth errors on first run. JWT generation fails despite correct App ID.

### Pitfall 3: SQLite BUSY Errors Under Concurrent Writes

**What goes wrong:** When 5 pipeline stages complete simultaneously and write to stage_results and findings, SQLite throws SQLITE_BUSY because only one writer can proceed at a time.

**Why it happens:** SQLite is single-writer. WAL mode allows concurrent reads but not concurrent writes. The default busy_timeout is 0ms (immediate failure).

**How to avoid:** (1) Set `PRAGMA busy_timeout = 5000` at connection time. This makes writers wait up to 5 seconds. (2) Wrap multi-table writes in transactions. (3) For Phase 2+, consider serializing all writes through a single write function.

**Warning signs:** Intermittent SQLITE_BUSY errors in logs. Missing stage results after pipeline completion.

### Pitfall 4: Installation Events Missing Repository Data

**What goes wrong:** When handling `installation.created` events, the payload includes the installation ID but may not include the full list of repositories if the user selected "All repositories." You need a separate API call to list repos.

**Why it happens:** GitHub's `installation.created` payload includes `repositories` only when the user selected specific repos. For "All repositories," the list may be truncated or empty.

**How to avoid:** On `installation.created`, also call `GET /installation/repositories` via the installation Octokit client to get the full list. Handle the `installation_repositories.added` and `installation_repositories.removed` events for incremental updates.

**Warning signs:** Empty repositories table after installation. Users see "no repos connected" despite installing the app.

### Pitfall 5: smee.io Channel URL Hardcoded or Expired

**What goes wrong:** The smee.io channel URL is hardcoded in the dev script or .env. The channel expires or someone else starts using it. Webhooks go to the wrong place.

**Why it happens:** smee.io channels are not authenticated. Anyone with the URL can read payloads.

**How to avoid:** Generate a fresh channel per dev session. Add a `dev:webhook` script that creates a new channel: `npx smee --url $(curl -s https://smee.io/new) --target http://localhost:3000/api/webhook`. Store the current URL in .env.local (gitignored), not .env.

**Warning signs:** Webhooks not arriving during local dev. Payloads visible on someone else's smee.io page.

## Code Examples

### npm Workspaces Root package.json

```json
{
  "name": "gstackapp",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "npm run dev --workspace=packages/api",
    "dev:webhook": "npx smee -u $SMEE_URL -t http://localhost:3000/api/webhook",
    "build": "npm run build --workspaces --if-present",
    "test": "vitest run --workspace",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:studio": "drizzle-kit studio"
  },
  "devDependencies": {
    "smee-client": "^5.0.0"
  }
}
```

### Root tsconfig.json (Project References)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "references": [
    { "path": "packages/shared" },
    { "path": "packages/api" },
    { "path": "packages/web" }
  ],
  "files": []
}
```

### API Package tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

### Hono App Entry with Node Server

```typescript
// packages/api/src/index.ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { config } from './lib/config'
import { reconcileStaleRuns } from './db/reconcile'
import webhookApp from './github/webhook'
import healthApp from './routes/health'

const app = new Hono()

// Global middleware (NOT applied to webhook route)
app.use('/api/*', logger())

// Mount routes
app.route('/', webhookApp)  // /api/webhook -- no JSON middleware
app.route('/', healthApp)   // /health

// Startup
reconcileStaleRuns()

serve({
  fetch: app.fetch,
  port: config.port,
}, (info) => {
  console.log(`gstackapp API listening on http://localhost:${info.port}`)
})
```

### Environment Config with Zod Validation

```typescript
// packages/api/src/lib/config.ts
import { z } from 'zod'
import { config as loadDotenv } from 'dotenv'
import { readFileSync } from 'node:fs'

loadDotenv()

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  databasePath: z.string().default('./data/gstackapp.db'),
  githubAppId: z.coerce.number(),
  githubPrivateKey: z.string(),
  githubWebhookSecret: z.string(),
  githubClientId: z.string().optional(),
  githubClientSecret: z.string().optional(),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
})

// Handle PEM key: either inline or file path
function resolvePrivateKey(): string {
  const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH
  if (keyPath) {
    return readFileSync(keyPath, 'utf-8')
  }
  const key = process.env.GITHUB_PRIVATE_KEY
  if (key) {
    return key.replace(/\\n/g, '\n')
  }
  throw new Error('GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH required')
}

export const config = configSchema.parse({
  port: process.env.PORT,
  databasePath: process.env.DATABASE_PATH,
  githubAppId: process.env.GITHUB_APP_ID,
  githubPrivateKey: resolvePrivateKey(),
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  nodeEnv: process.env.NODE_ENV,
})
```

### Webhook Event Handlers

```typescript
// packages/api/src/github/handlers.ts
import { Webhooks } from '@octokit/webhooks'
import { db } from '../db/client'
import { githubInstallations, repositories } from '../db/schema'
import { getInstallationOctokit } from './auth'
import { eq } from 'drizzle-orm'

export function registerHandlers(webhooks: Webhooks) {
  // Installation created -- user installed the app
  webhooks.on('installation.created', async ({ payload }) => {
    const { installation, repositories: repos } = payload

    // Upsert installation
    db.insert(githubInstallations).values({
      id: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      appId: installation.app_id,
      status: 'active',
    }).onConflictDoUpdate({
      target: githubInstallations.id,
      set: { status: 'active', updatedAt: new Date() },
    }).run()

    // Persist selected repositories
    if (repos) {
      for (const repo of repos) {
        db.insert(repositories).values({
          id: repo.id,
          installationId: installation.id,
          fullName: repo.full_name,
          isActive: true,
        }).onConflictDoNothing().run()
      }
    }

    // Fetch full repo list if user selected "All repositories"
    if (installation.repository_selection === 'all') {
      const octokit = getInstallationOctokit(installation.id)
      const { data } = await octokit.apps.listReposAccessibleToInstallation()
      for (const repo of data.repositories) {
        db.insert(repositories).values({
          id: repo.id,
          installationId: installation.id,
          fullName: repo.full_name,
          defaultBranch: repo.default_branch,
          isActive: true,
        }).onConflictDoNothing().run()
      }
    }
  })

  // Installation deleted -- user uninstalled
  webhooks.on('installation.deleted', async ({ payload }) => {
    db.update(githubInstallations)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(githubInstallations.id, payload.installation.id))
      .run()
  })

  // Repositories added to installation
  webhooks.on('installation_repositories.added', async ({ payload }) => {
    for (const repo of payload.repositories_added) {
      db.insert(repositories).values({
        id: repo.id,
        installationId: payload.installation.id,
        fullName: repo.full_name,
        isActive: true,
      }).onConflictDoNothing().run()
    }
  })

  // Repositories removed from installation
  webhooks.on('installation_repositories.removed', async ({ payload }) => {
    for (const repo of payload.repositories_removed) {
      db.update(repositories)
        .set({ isActive: false })
        .where(eq(repositories.id, repo.id))
        .run()
    }
  })

  // Pull request events -- the main trigger
  webhooks.on(
    ['pull_request.opened', 'pull_request.synchronize', 'pull_request.reopened'],
    async ({ id, payload }) => {
      // Idempotency check + pipeline creation happens here
      // Async dispatch to pipeline orchestrator (Phase 2)
      // For Phase 1, just persist the PR data
    }
  )
}
```

### Vitest Test with Hono testClient

```typescript
// packages/api/src/__tests__/webhook.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { testClient } from 'hono/testing'
import app from '../index'

// Captured fixture from real GitHub webhook delivery
import prOpenedFixture from './fixtures/pull_request.opened.json'

describe('Webhook endpoint', () => {
  it('returns 400 for missing headers', async () => {
    const client = testClient(app)
    const res = await client.api.webhook.$post({
      json: {},
    })
    expect(res.status).toBe(400)
  })

  it('returns 401 for invalid signature', async () => {
    const res = await app.request('/api/webhook', {
      method: 'POST',
      headers: {
        'x-github-delivery': 'test-delivery-id',
        'x-github-event': 'pull_request',
        'x-hub-signature-256': 'sha256=invalid',
        'content-type': 'application/json',
      },
      body: JSON.stringify(prOpenedFixture),
    })
    expect(res.status).toBe(401)
  })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Probot framework for GitHub Apps | Raw Octokit packages + Hono | 2024+ | Probot bundles Express; modern apps use framework-agnostic Octokit packages |
| `@octokit/webhooks` createNodeMiddleware | Custom Hono middleware with verifyAndReceive | Current | createNodeMiddleware assumes Node http.Server -- doesn't work with Hono/Bun/Deno |
| Drizzle ORM push-based schema | Drizzle ORM generate + migrate | 0.30+ | Generate creates SQL migration files for reproducible deployments |
| Zod 3.x | Zod 4.x available (4.3.6) | 2026 | Zod 4 adds z.xor, loose records, improved intersections. Stick with 3.x for Phase 1 ecosystem compatibility. |

## Open Questions

1. **GitHub App Registration**
   - What we know: App needs to be registered on GitHub with specific permissions (D-11) and webhook URL
   - What's unclear: Whether to register manually via GitHub UI or use manifest-based registration. Manual is simpler for a single deployment.
   - Recommendation: Register manually at github.com/settings/apps/new. Document the exact settings in a setup guide. Manifest registration is overkill for single-deployment.

2. **Tailscale Funnel Port**
   - What we know: Funnel supports ports 443, 8443, and 10000 only
   - What's unclear: Whether the Hono server should listen on port 443 directly or if Funnel proxies from 443 to a local port
   - Recommendation: Run Hono on port 3000. Configure Funnel: `tailscale funnel 3000`. Funnel handles TLS termination and proxies to localhost:3000.

3. **Webhook Payload Fixture Capture**
   - What we know: Need real payloads for unit tests (D-13)
   - What's unclear: Best method to capture payloads
   - Recommendation: Use smee.io during initial setup. Capture payloads from the smee.io web UI or add a dev-mode middleware that writes payloads to `packages/api/src/__tests__/fixtures/`. Also: GitHub's webhook delivery log (Settings > Webhooks > Recent Deliveries) lets you view and redeliver payloads.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v22.22.0 | -- |
| npm | Package management | Yes | 10.9.4 | -- |
| git | Clone operations | Yes | 2.50.1 | -- |
| Tailscale | Webhook ingress | Yes | 1.94.1 | smee.io for dev, ngrok for prod |
| Tailscale Funnel | HTTPS endpoint | Available (not configured) | -- | Configure with `tailscale funnel 3000` |
| smee-client | Dev webhook proxy | Not installed | -- | `npm install -D smee-client` or `npx smee` |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:**
- smee-client: Install as dev dependency (`npm install -D smee-client`)

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `vitest.config.ts` (to be created in Wave 0) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GHUB-01 | Installation webhook persists installation + repos | integration | `npx vitest run packages/api/src/__tests__/handlers.test.ts -t "installation"` | No - Wave 0 |
| GHUB-02 | PR webhook received and acknowledged | integration | `npx vitest run packages/api/src/__tests__/webhook.test.ts -t "pull_request"` | No - Wave 0 |
| GHUB-03 | Installation token auto-refresh via Octokit | unit | `npx vitest run packages/api/src/__tests__/auth.test.ts` | No - Wave 0 |
| GHUB-04 | synchronize event creates new pipeline run | integration | `npx vitest run packages/api/src/__tests__/handlers.test.ts -t "synchronize"` | No - Wave 0 |
| GHUB-05 | Webhook ACKs within 2s, duplicate delivery ignored | integration | `npx vitest run packages/api/src/__tests__/webhook.test.ts -t "idempotency"` | No - Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` -- root config with workspace support
- [ ] `packages/api/vitest.config.ts` -- API workspace config
- [ ] `packages/api/src/__tests__/fixtures/` -- Captured webhook payload fixtures
- [ ] `packages/api/src/__tests__/webhook.test.ts` -- Webhook endpoint tests (signature, headers, idempotency)
- [ ] `packages/api/src/__tests__/handlers.test.ts` -- Event handler tests (installation CRUD, PR events)
- [ ] `packages/api/src/__tests__/auth.test.ts` -- GitHub auth factory tests
- [ ] `packages/api/src/__tests__/db.test.ts` -- Schema + migration + pragma tests

## Project Constraints (from CLAUDE.md)

- **Stack:** Hono + SQLite + Drizzle + React (locked)
- **Deploy:** Mac Mini via Tailscale Funnel (no cloud infra for Phase 1)
- **Auth:** None for Phase 1 (dashboard is public, single-user)
- **Display:** Desktop-only, dark mode only, 1024px min-width
- **Security:** Sandboxed AI file access (path resolution + symlink escape prevention) -- relevant for Phase 2 but foundation laid here
- **Design System:** Always read DESIGN.md before visual/UI decisions
- **GSD Workflow:** All edits through GSD commands
- **Conventions:** Not yet established -- Phase 1 establishes the patterns

## Sources

### Primary (HIGH confidence)
- [Hono Stripe Webhook Example](https://hono.dev/examples/stripe-webhook) -- Raw body pattern for signature verification
- [Hono Request API](https://hono.dev/docs/api/request) -- c.req.text() caching behavior
- [Octokit webhooks.js](https://github.com/octokit/webhooks.js/) -- v14.2.0 API: verifyAndReceive, on(), event handlers
- [Octokit auth-app.js](https://github.com/octokit/auth-app.js/) -- v8.2.0 API: createAppAuth, installation token caching
- [Drizzle ORM SQLite Column Types](https://orm.drizzle.team/docs/column-types/sqlite) -- integer modes, text, table definition
- [Drizzle ORM Indexes & Constraints](https://orm.drizzle.team/docs/indexes-constraints) -- uniqueIndex, composite indexes
- [Drizzle ORM SQLite Get Started](https://orm.drizzle.team/docs/get-started-sqlite) -- better-sqlite3 setup, drizzle-kit config
- [GitHub Docs: Webhook Best Practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks) -- 10s timeout, idempotency, signature verification
- [GitHub Docs: Using Webhooks with GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps) -- Registration, permissions

### Secondary (MEDIUM confidence)
- [DEV Community: Hono + GitHub Webhooks](https://dev.to/fiberplane/building-a-community-database-with-github-a-guide-to-webhook-and-api-integration-with-honojs-1m8h) -- Hono middleware pattern for Octokit webhooks
- [Hono Issue #3083: Body alteration](https://github.com/honojs/hono/issues/3083) -- Raw body vs parsed body for signature verification
- [Hono Issue #1387: Body consumed once](https://github.com/honojs/hono/issues/1387) -- Body caching fix in 3.5.7+
- [GitHub Docs: App Manifest Registration](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest) -- Automated app registration
- [smee.io](https://smee.io/) -- Webhook proxy for local development
- [npm registry](https://www.npmjs.com/) -- Package version verification (all versions verified 2026-03-30)

### Tertiary (LOW confidence)
- None -- all findings verified with primary or secondary sources

### Pre-existing Project Research (HIGH confidence)
- `.planning/research/ARCHITECTURE.md` -- System architecture, component responsibilities, build order
- `.planning/research/STACK.md` -- Full technology stack with verified versions and rationale
- `.planning/research/PITFALLS.md` -- Domain pitfalls including webhook reliability, sandbox escape, token expiration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All packages verified against npm registry. Versions confirmed current.
- Architecture: HIGH -- Patterns drawn from Octokit official docs, Hono official examples, and project research docs.
- Pitfalls: HIGH -- Body consumption issue verified via Hono GitHub issues. SQLite WAL/busy_timeout well-documented. PEM key issue is a known gotcha.

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable stack, no fast-moving dependencies)
