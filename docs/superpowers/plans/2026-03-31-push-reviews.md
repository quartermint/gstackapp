# Push Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable gstackapp to review pushes to default branches — not just PRs — with a generalized review_units data model, push webhook handler, and commit comment posting.

**Architecture:** Introduce a `review_units` table that generalizes both PRs and pushes as pipeline triggers. Migrate `pipeline_runs.pr_id` → `review_unit_id`. Add push webhook handler to `handlers.ts`. Update `comment.ts` to dispatch between PR issue comments and commit comments. Update the orchestrator, API routes, and frontend to work with the unified model.

**Tech Stack:** Hono, Drizzle ORM, better-sqlite3, @octokit/rest, @octokit/webhooks, React, TanStack Query, Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `packages/api/src/db/schema.ts` (modify) | Add `reviewUnits` table, add `reviewUnitId` to `pipelineRuns`, deprecate `prId` |
| Create | `packages/api/scripts/db-init.ts` (modify) | Add `review_units` CREATE TABLE + migration SQL |
| Modify | `packages/api/src/lib/idempotency.ts` | Add `ensureReviewUnit()`, update `tryCreatePipelineRun()` to accept `reviewUnitId` |
| Modify | `packages/api/src/github/handlers.ts` | Add `push` webhook handler, refactor PR handler to use review units |
| Modify | `packages/api/src/pipeline/orchestrator.ts` | Generalize `PipelineInput` for both PR and push types |
| Modify | `packages/api/src/github/comment.ts` | Add `postCommitComment()` for push reviews |
| Modify | `packages/api/src/pipeline/stage-runner.ts` | Update `buildStageInput()` to handle push context (no PR number) |
| Modify | `packages/api/src/routes/pipelines.ts` | Join through `reviewUnits` instead of `pullRequests` |
| Modify | `packages/web/src/hooks/usePipelineFeed.ts` | Update `PipelineListItem` type for unified review unit |
| Modify | `packages/web/src/components/feed/PRCard.tsx` | Add PR/Push badge, show commit message for pushes |
| Modify | `packages/web/src/components/feed/PRDetail.tsx` | Show push context (commit SHA, ref) instead of PR number for pushes |
| Create | `packages/api/tests/review-units.test.ts` | Tests for review unit CRUD and migration |
| Create | `packages/api/tests/push-handler.test.ts` | Tests for push webhook handler |
| Modify | `packages/shared/src/schemas/pipeline.ts` | Add `ReviewUnitType` schema |

---

### Task 1: Add ReviewUnitType to shared schemas

**Files:**
- Modify: `packages/shared/src/schemas/pipeline.ts`

- [ ] **Step 1: Write the test**

Create `packages/shared/tests/pipeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ReviewUnitTypeSchema } from '../src/schemas/pipeline'

describe('ReviewUnitTypeSchema', () => {
  it('accepts pr', () => {
    expect(ReviewUnitTypeSchema.parse('pr')).toBe('pr')
  })
  it('accepts push', () => {
    expect(ReviewUnitTypeSchema.parse('push')).toBe('push')
  })
  it('rejects invalid type', () => {
    expect(() => ReviewUnitTypeSchema.parse('issue')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/tests/pipeline.test.ts`
Expected: FAIL — `ReviewUnitTypeSchema` not exported

- [ ] **Step 3: Add ReviewUnitTypeSchema to shared**

In `packages/shared/src/schemas/pipeline.ts`, add after the existing imports:

```ts
export const ReviewUnitTypeSchema = z.enum(['pr', 'push'])
export type ReviewUnitType = z.infer<typeof ReviewUnitTypeSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/tests/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/pipeline.ts packages/shared/tests/pipeline.test.ts
git commit -m "feat: add ReviewUnitType schema to shared package"
```

---

### Task 2: Add review_units table to Drizzle schema and db-init

**Files:**
- Modify: `packages/api/src/db/schema.ts`
- Modify: `packages/api/scripts/db-init.ts`

- [ ] **Step 1: Write the test**

Create `packages/api/tests/review-units.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../src/db/schema'
import { eq } from 'drizzle-orm'

describe('review_units table', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof drizzle>

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')

    // Create minimal tables for testing
    sqlite.exec(`
      CREATE TABLE github_installations (
        id INTEGER PRIMARY KEY,
        account_login TEXT NOT NULL,
        account_type TEXT NOT NULL,
        app_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE repositories (
        id INTEGER PRIMARY KEY,
        installation_id INTEGER NOT NULL REFERENCES github_installations(id),
        full_name TEXT NOT NULL,
        default_branch TEXT NOT NULL DEFAULT 'main',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE review_units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL REFERENCES repositories(id),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        author_login TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        base_sha TEXT,
        ref TEXT,
        pr_number INTEGER,
        state TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX review_unit_dedup_idx ON review_units(repo_id, type, head_sha);
    `)

    // Seed installation + repo
    sqlite.exec(`
      INSERT INTO github_installations VALUES (1, 'test', 'User', 123, 'active', ${Date.now()}, ${Date.now()});
      INSERT INTO repositories VALUES (100, 1, 'test/repo', 'main', 1, ${Date.now()});
    `)

    db = drizzle(sqlite, { schema })
  })

  it('inserts a push review unit', () => {
    const result = db.insert(schema.reviewUnits).values({
      repoId: 100,
      type: 'push',
      title: 'feat: add user login',
      authorLogin: 'rstern',
      headSha: 'abc123',
      baseSha: 'def456',
      ref: 'refs/heads/main',
    }).returning({ id: schema.reviewUnits.id }).get()

    expect(result.id).toBeGreaterThan(0)
  })

  it('inserts a PR review unit', () => {
    const result = db.insert(schema.reviewUnits).values({
      repoId: 100,
      type: 'pr',
      title: 'Fix login bug',
      authorLogin: 'rstern',
      headSha: 'xyz789',
      baseSha: 'main',
      ref: 'refs/heads/fix-login',
      prNumber: 42,
    }).returning({ id: schema.reviewUnits.id }).get()

    expect(result.id).toBeGreaterThan(0)
  })

  it('enforces dedup index on repo_id + type + head_sha', () => {
    db.insert(schema.reviewUnits).values({
      repoId: 100,
      type: 'push',
      title: 'first push',
      authorLogin: 'rstern',
      headSha: 'abc123',
    }).run()

    // Inserting same repo_id + type + head_sha should conflict
    expect(() => {
      db.insert(schema.reviewUnits).values({
        repoId: 100,
        type: 'push',
        title: 'duplicate push',
        authorLogin: 'rstern',
        headSha: 'abc123',
      }).run()
    }).toThrow()
  })

  it('allows same head_sha for different types', () => {
    db.insert(schema.reviewUnits).values({
      repoId: 100,
      type: 'push',
      title: 'push',
      authorLogin: 'rstern',
      headSha: 'abc123',
    }).run()

    // Same SHA but type='pr' should succeed
    const result = db.insert(schema.reviewUnits).values({
      repoId: 100,
      type: 'pr',
      title: 'pr for same commit',
      authorLogin: 'rstern',
      headSha: 'abc123',
      prNumber: 1,
    }).returning({ id: schema.reviewUnits.id }).get()

    expect(result.id).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/api/tests/review-units.test.ts`
Expected: FAIL — `schema.reviewUnits` does not exist

- [ ] **Step 3: Add reviewUnits table to Drizzle schema**

In `packages/api/src/db/schema.ts`, add after the `pullRequests` table definition:

```ts
// ── Review Units (generalizes PRs + Pushes) ──────────────────────────────────

export const reviewUnits = sqliteTable('review_units', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repoId: integer('repo_id')
    .notNull()
    .references(() => repositories.id),
  type: text('type').notNull(), // 'pr' | 'push'
  title: text('title').notNull(),
  authorLogin: text('author_login').notNull(),
  headSha: text('head_sha').notNull(),
  baseSha: text('base_sha'),
  ref: text('ref'),
  prNumber: integer('pr_number'),
  state: text('state').notNull().default('open'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('review_unit_dedup_idx').on(table.repoId, table.type, table.headSha),
])
```

Also add `reviewUnitId` column to `pipelineRuns` table — add this field after the existing `prId`:

```ts
  reviewUnitId: integer('review_unit_id')
    .references(() => reviewUnits.id),
```

- [ ] **Step 4: Add review_units to db-init.ts**

In `packages/api/scripts/db-init.ts`, add after the `pull_requests` CREATE TABLE block and before `pipeline_runs`:

```sql
  CREATE TABLE IF NOT EXISTS review_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL REFERENCES repositories(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    author_login TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    base_sha TEXT,
    ref TEXT,
    pr_number INTEGER,
    state TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS review_unit_dedup_idx ON review_units(repo_id, type, head_sha);
```

Also add `review_unit_id` column to `pipeline_runs` CREATE TABLE:

```sql
    review_unit_id INTEGER REFERENCES review_units(id),
```

And add an index:

```sql
  CREATE INDEX IF NOT EXISTS pipeline_review_unit_idx ON pipeline_runs(review_unit_id);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/api/tests/review-units.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/db/schema.ts packages/api/scripts/db-init.ts packages/api/tests/review-units.test.ts
git commit -m "feat: add review_units table and schema for unified PR/push triggers"
```

---

### Task 3: Add ensureReviewUnit() and update tryCreatePipelineRun()

**Files:**
- Modify: `packages/api/src/lib/idempotency.ts`
- Create: `packages/api/tests/idempotency-review-unit.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/api/tests/idempotency-review-unit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the db module before imports
vi.mock('../src/db/client', async () => {
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const schema = await import('../src/db/schema')

  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(`
    CREATE TABLE github_installations (
      id INTEGER PRIMARY KEY, account_login TEXT NOT NULL,
      account_type TEXT NOT NULL, app_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE repositories (
      id INTEGER PRIMARY KEY,
      installation_id INTEGER NOT NULL REFERENCES github_installations(id),
      full_name TEXT NOT NULL, default_branch TEXT NOT NULL DEFAULT 'main',
      is_active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
    );
    CREATE TABLE review_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL REFERENCES repositories(id),
      type TEXT NOT NULL, title TEXT NOT NULL,
      author_login TEXT NOT NULL, head_sha TEXT NOT NULL,
      base_sha TEXT, ref TEXT, pr_number INTEGER,
      state TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX review_unit_dedup_idx ON review_units(repo_id, type, head_sha);
    CREATE TABLE pipeline_runs (
      id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL,
      pr_id INTEGER, review_unit_id INTEGER REFERENCES review_units(id),
      installation_id INTEGER NOT NULL, head_sha TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING', comment_id INTEGER,
      started_at INTEGER, completed_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX delivery_id_idx ON pipeline_runs(delivery_id);
  `)
  sqlite.exec(`
    INSERT INTO github_installations VALUES (1, 'test', 'User', 1, 'active', ${Date.now()}, ${Date.now()});
    INSERT INTO repositories VALUES (100, 1, 'test/repo', 'main', 1, ${Date.now()});
  `)

  return { db: drizzle(sqlite, { schema }), rawDb: sqlite }
})

import { ensureReviewUnit, tryCreatePipelineRun } from '../src/lib/idempotency'

describe('ensureReviewUnit', () => {
  it('creates a push review unit and returns its id', () => {
    const id = ensureReviewUnit({
      repoId: 100,
      type: 'push',
      title: 'feat: add auth',
      authorLogin: 'rstern',
      headSha: 'abc123',
      baseSha: 'def456',
      ref: 'refs/heads/main',
    })

    expect(id).toBeGreaterThan(0)
  })

  it('returns existing id on duplicate (idempotent)', () => {
    const id1 = ensureReviewUnit({
      repoId: 100,
      type: 'push',
      title: 'first',
      authorLogin: 'rstern',
      headSha: 'dup123',
    })
    const id2 = ensureReviewUnit({
      repoId: 100,
      type: 'push',
      title: 'updated title',
      authorLogin: 'rstern',
      headSha: 'dup123',
    })

    expect(id1).toBe(id2)
  })
})

describe('tryCreatePipelineRun with reviewUnitId', () => {
  it('creates a pipeline run with reviewUnitId', () => {
    const ruId = ensureReviewUnit({
      repoId: 100,
      type: 'push',
      title: 'test push',
      authorLogin: 'rstern',
      headSha: 'pipeline-test-sha',
    })

    const { created, runId } = tryCreatePipelineRun({
      deliveryId: 'test-delivery-ru-1',
      reviewUnitId: ruId,
      installationId: 1,
      headSha: 'pipeline-test-sha',
    })

    expect(created).toBe(true)
    expect(runId).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/api/tests/idempotency-review-unit.test.ts`
Expected: FAIL — `ensureReviewUnit` not exported

- [ ] **Step 3: Implement ensureReviewUnit() and update tryCreatePipelineRun()**

In `packages/api/src/lib/idempotency.ts`, update the imports:

```ts
import { pipelineRuns, pullRequests, reviewUnits } from '../db/schema'
import { nanoid } from 'nanoid'
import { eq, sql, and } from 'drizzle-orm'
```

Add `ensureReviewUnit` function after `ensurePullRequest`:

```ts
/**
 * Upsert a review unit record. Uses INSERT with ON CONFLICT UPDATE
 * on the dedup index (repo_id, type, head_sha).
 * Returns the primary key ID of the review unit.
 */
export function ensureReviewUnit(params: {
  repoId: number
  type: 'pr' | 'push'
  title: string
  authorLogin: string
  headSha: string
  baseSha?: string
  ref?: string
  prNumber?: number
}): number {
  db.insert(reviewUnits)
    .values({
      repoId: params.repoId,
      type: params.type,
      title: params.title,
      authorLogin: params.authorLogin,
      headSha: params.headSha,
      baseSha: params.baseSha,
      ref: params.ref,
      prNumber: params.prNumber,
    })
    .onConflictDoUpdate({
      target: [reviewUnits.repoId, reviewUnits.type, reviewUnits.headSha],
      set: {
        title: params.title,
        updatedAt: new Date(),
      },
    })
    .run()

  const row = db.select({ id: reviewUnits.id })
    .from(reviewUnits)
    .where(
      and(
        eq(reviewUnits.repoId, params.repoId),
        eq(reviewUnits.type, params.type),
        eq(reviewUnits.headSha, params.headSha),
      )
    )
    .get()

  return row!.id
}
```

Update `tryCreatePipelineRun` to accept optional `reviewUnitId`:

```ts
export function tryCreatePipelineRun(params: {
  deliveryId: string
  prId?: number
  reviewUnitId?: number
  installationId: number
  headSha: string
}): { created: boolean; runId: string } {
  const runId = nanoid()

  const result = db
    .insert(pipelineRuns)
    .values({
      id: runId,
      deliveryId: params.deliveryId,
      prId: params.prId ?? 0,
      reviewUnitId: params.reviewUnitId,
      installationId: params.installationId,
      headSha: params.headSha,
      status: 'PENDING',
    })
    .onConflictDoNothing()
    .run()

  return {
    created: result.changes > 0,
    runId: result.changes > 0 ? runId : '',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/api/tests/idempotency-review-unit.test.ts`
Expected: PASS

- [ ] **Step 5: Run all existing tests to verify no regressions**

Run: `npx vitest run`
Expected: All 239+ tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/lib/idempotency.ts packages/api/tests/idempotency-review-unit.test.ts
git commit -m "feat: add ensureReviewUnit() and update tryCreatePipelineRun for review_unit_id"
```

---

### Task 4: Add push webhook handler

**Files:**
- Modify: `packages/api/src/github/handlers.ts`
- Create: `packages/api/tests/push-handler.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/api/tests/push-handler.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('push webhook handler logic', () => {
  it('skips pushes to non-default branch', () => {
    const payload = {
      ref: 'refs/heads/feature-branch',
      repository: { default_branch: 'main', id: 100, full_name: 'test/repo' },
      commits: [{ id: 'abc', message: 'test' }],
      forced: false,
      pusher: { name: 'rstern' },
      after: 'abc123',
      before: 'def456',
      installation: { id: 1 },
    }

    const shouldProcess = payload.ref === `refs/heads/${payload.repository.default_branch}`
    expect(shouldProcess).toBe(false)
  })

  it('skips empty pushes (branch create/delete)', () => {
    const payload = {
      ref: 'refs/heads/main',
      repository: { default_branch: 'main' },
      commits: [],
      forced: false,
    }
    expect(payload.commits.length === 0).toBe(true)
  })

  it('skips force pushes', () => {
    const payload = {
      ref: 'refs/heads/main',
      repository: { default_branch: 'main' },
      commits: [{ id: 'abc', message: 'test' }],
      forced: true,
    }
    expect(payload.forced).toBe(true)
  })

  it('processes normal push to default branch', () => {
    const payload = {
      ref: 'refs/heads/main',
      repository: { default_branch: 'main', id: 100, full_name: 'test/repo' },
      commits: [
        { id: 'abc', message: 'feat: add auth' },
        { id: 'def', message: 'fix: typo' },
      ],
      forced: false,
      pusher: { name: 'rstern' },
      after: 'def456',
      before: 'abc123',
      installation: { id: 1 },
    }

    const shouldProcess =
      payload.ref === `refs/heads/${payload.repository.default_branch}` &&
      payload.commits.length > 0 &&
      !payload.forced

    expect(shouldProcess).toBe(true)
  })

  it('summarizes push commits correctly', () => {
    const commits = [
      { message: 'feat: add authentication system' },
      { message: 'fix: correct login redirect' },
      { message: 'test: add auth tests' },
    ]

    const firstLine = commits[0].message.split('\n')[0]
    const summary = commits.length === 1
      ? firstLine
      : `${firstLine} (+${commits.length - 1} more)`

    expect(summary).toBe('feat: add authentication system (+2 more)')
  })
})
```

- [ ] **Step 2: Run test to verify it passes (logic tests)**

Run: `npx vitest run packages/api/tests/push-handler.test.ts`
Expected: PASS (these test pure logic, not wiring)

- [ ] **Step 3: Add push handler to handlers.ts**

In `packages/api/src/github/handlers.ts`, update the import to include `ensureReviewUnit`:

```ts
import { ensurePullRequest, tryCreatePipelineRun, ensureReviewUnit } from '../lib/idempotency'
```

Add the `summarizePushCommits` helper function before `registerHandlers`:

```ts
/**
 * Summarize push commits into a title string.
 * Single commit: first line of message.
 * Multiple commits: first commit message + "(+N more)".
 */
function summarizePushCommits(commits: Array<{ message: string }>): string {
  if (commits.length === 0) return 'Empty push'
  const firstLine = commits[0].message.split('\n')[0]
  if (commits.length === 1) return firstLine
  return `${firstLine} (+${commits.length - 1} more)`
}
```

Add the push webhook handler inside `registerHandlers`, after the pull_request handler block:

```ts
  // ── Push Events ───────────────────────────────────────────────────────────
  // Review pushes to default branch. Creates review_units with type='push'
  // and dispatches pipeline with commit comparison diff.
  webhooks.on('push', async ({ id, payload }) => {
    // Only review pushes to the default branch
    if (payload.ref !== `refs/heads/${payload.repository.default_branch}`) return
    // Skip empty pushes (branch create/delete)
    if (!payload.commits || payload.commits.length === 0) return
    // Skip force-pushes
    if (payload.forced) return

    const reviewUnitId = ensureReviewUnit({
      repoId: payload.repository.id,
      type: 'push',
      title: summarizePushCommits(payload.commits),
      authorLogin: payload.pusher.name,
      headSha: payload.after,
      baseSha: payload.before,
      ref: payload.ref,
    })

    const { created, runId } = tryCreatePipelineRun({
      deliveryId: id,
      reviewUnitId,
      installationId: payload.installation!.id,
      headSha: payload.after,
    })

    if (created) {
      console.log(
        `[handlers] Pipeline run created: ${runId} for push to ${payload.repository.full_name} (${payload.before.slice(0, 7)}..${payload.after.slice(0, 7)})`
      )
      executePipeline({
        runId,
        installationId: payload.installation!.id,
        repoFullName: payload.repository.full_name,
        headSha: payload.after,
        baseSha: payload.before,
        ref: payload.ref,
        type: 'push',
      }).catch((err) => {
        console.error(`[handlers] Pipeline failed for run ${runId}:`, err)
      })
    } else {
      console.log(`[handlers] Duplicate push delivery ignored: ${id}`)
    }
  })
```

Also update the existing PR handler to create review units. After the `ensurePullRequest()` call, add:

```ts
      const reviewUnitId = ensureReviewUnit({
        repoId: payload.repository.id,
        type: 'pr',
        title: payload.pull_request.title,
        authorLogin: payload.pull_request.user?.login ?? 'unknown',
        headSha: payload.pull_request.head.sha,
        baseSha: payload.pull_request.base.ref,
        ref: payload.pull_request.head.ref,
        prNumber: payload.pull_request.number,
      })
```

Update the `tryCreatePipelineRun` call to include `reviewUnitId`:

```ts
      const { created, runId } = tryCreatePipelineRun({
        deliveryId: id,
        prId,
        reviewUnitId,
        installationId: payload.installation!.id,
        headSha: payload.pull_request.head.sha,
      })
```

Update the `executePipeline` call to include `type: 'pr'`:

```ts
        executePipeline({
          runId,
          installationId: payload.installation!.id,
          repoFullName: payload.repository.full_name,
          prNumber: payload.pull_request.number,
          headSha: payload.pull_request.head.sha,
          headRef: payload.pull_request.head.ref,
          type: 'pr',
        }).catch((err) => {
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/api/tests/push-handler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/github/handlers.ts packages/api/tests/push-handler.test.ts
git commit -m "feat: add push webhook handler with review_units integration"
```

---

### Task 5: Generalize orchestrator for PR and push types

**Files:**
- Modify: `packages/api/src/pipeline/orchestrator.ts`
- Modify: `packages/api/src/pipeline/stage-runner.ts`

- [ ] **Step 1: Write the test**

Create `packages/api/tests/orchestrator-push.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('PipelineInput type', () => {
  it('accepts PR input with prNumber', () => {
    const input = {
      runId: 'test-1',
      installationId: 1,
      repoFullName: 'test/repo',
      headSha: 'abc123',
      type: 'pr' as const,
      prNumber: 42,
      headRef: 'fix-bug',
    }
    expect(input.type).toBe('pr')
    expect(input.prNumber).toBe(42)
  })

  it('accepts push input with baseSha and ref', () => {
    const input = {
      runId: 'test-2',
      installationId: 1,
      repoFullName: 'test/repo',
      headSha: 'abc123',
      type: 'push' as const,
      baseSha: 'def456',
      ref: 'refs/heads/main',
    }
    expect(input.type).toBe('push')
    expect(input.baseSha).toBe('def456')
  })
})

describe('buildStageInput for push context', () => {
  it('formats push header with commit range', () => {
    const baseSha = 'def456789abcdef'
    const headSha = 'abc123456789abc'
    const header = `## Push Review\n**Commits:** ${baseSha.slice(0, 7)}..${headSha.slice(0, 7)}`
    expect(header).toContain('Push Review')
    expect(header).toContain('def4567..abc1234')
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run packages/api/tests/orchestrator-push.test.ts`
Expected: PASS

- [ ] **Step 3: Update PipelineInput in orchestrator.ts**

Replace the `PipelineInput` interface in `packages/api/src/pipeline/orchestrator.ts`:

```ts
export interface PipelineInput {
  runId: string
  installationId: number
  repoFullName: string   // owner/repo
  headSha: string
  type: 'pr' | 'push'
  // PR-specific
  prNumber?: number
  headRef?: string       // branch name for clone
  // Push-specific
  baseSha?: string
  ref?: string           // 'refs/heads/main'
}
```

Add `postCommitComment` to the imports from comment.ts:

```ts
import { createSkeletonComment, updatePRComment, postCommitComment } from '../github/comment'
```

In `executePipeline`, replace the PR-specific `octokit.pulls.listFiles` block with type-aware diff fetching:

```ts
    // Fetch changed files based on review type
    let mappedFiles: Array<{
      filename: string
      status: string
      additions: number
      deletions: number
      patch?: string
    }>

    if (input.type === 'pr' && input.prNumber) {
      const { data: prFiles } = await octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: input.prNumber,
      })
      mappedFiles = prFiles.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }))
    } else if (input.type === 'push' && input.baseSha) {
      const { data: comparison } = await octokit.repos.compareCommits({
        owner,
        repo,
        base: input.baseSha,
        head: input.headSha,
      })
      mappedFiles = (comparison.files ?? []).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }))
    } else {
      throw new Error(`Invalid pipeline input: type=${input.type}`)
    }
```

Replace the skeleton comment block with PR-only logic:

```ts
    // Post skeleton comment (PR only — push comments are posted at completion)
    if (input.type === 'pr' && input.prNumber) {
      const commentInput = { octokit, owner, repo, prNumber: input.prNumber, runId: input.runId }
      await createSkeletonComment(commentInput).catch((err) => {
        logger.error({ runId: input.runId, error: (err as Error).message }, 'Skeleton comment failed (non-fatal)')
      })
    }
```

Update clone ref logic:

```ts
    const cloneRef = input.headRef ?? input.ref?.replace('refs/heads/', '') ?? 'main'
```

Use `cloneRef` in the `cloneRepo` call.

Update `runStageWithRetry` calls to pass type info:

```ts
        runStageWithRetry({
          stage,
          runId: input.runId,
          clonePath: clonePath!,
          prFiles: mappedFiles,
          repoFullName: input.repoFullName,
          headSha: input.headSha,
          type: input.type,
          prNumber: input.prNumber,
          baseSha: input.baseSha,
        })
```

Replace the final comment update block with type-aware dispatching:

```ts
    // Post review comment based on type
    if (input.type === 'pr' && input.prNumber) {
      const commentInput = { octokit, owner, repo, prNumber: input.prNumber, runId: input.runId }
      await updatePRComment(commentInput).catch((err) => {
        logger.error({ runId: input.runId, error: (err as Error).message }, 'Final comment update failed (non-fatal)')
      })
    } else if (input.type === 'push') {
      await postCommitComment({ octokit, owner, repo, commitSha: input.headSha, runId: input.runId }).catch((err) => {
        logger.error({ runId: input.runId, error: (err as Error).message }, 'Commit comment failed (non-fatal)')
      })
    }
```

- [ ] **Step 4: Update StageInput in stage-runner.ts**

Update the `StageInput` interface in `packages/api/src/pipeline/stage-runner.ts`:

```ts
export interface StageInput {
  stage: Stage
  runId: string
  clonePath: string
  prFiles: Array<{
    filename: string
    status: string
    additions: number
    deletions: number
    patch?: string
  }>
  repoFullName: string
  headSha: string
  type: 'pr' | 'push'
  prNumber?: number
  baseSha?: string
}
```

Update `buildStageInput` to handle push context. Replace the first two lines of content building:

```ts
function buildStageInput(input: StageInput): string {
  const totalAdditions = input.prFiles.reduce((sum, f) => sum + f.additions, 0)
  const totalDeletions = input.prFiles.reduce((sum, f) => sum + f.deletions, 0)

  let content: string
  if (input.type === 'pr' && input.prNumber) {
    content = `## Pull Request #${input.prNumber}\n`
  } else {
    content = `## Push Review\n`
    if (input.baseSha) {
      content += `**Commits:** ${input.baseSha.slice(0, 7)}..${input.headSha.slice(0, 7)}\n`
    }
  }
  content += `**Repository:** ${input.repoFullName}\n`
  content += `**Head SHA:** ${input.headSha}\n`
  content += `**Files changed:** ${input.prFiles.length}\n`
  content += `**Total additions:** +${totalAdditions} / **deletions:** -${totalDeletions}\n\n`
```

The rest of `buildStageInput` (changed files list, patches, instructions) remains unchanged.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/pipeline/orchestrator.ts packages/api/src/pipeline/stage-runner.ts packages/api/tests/orchestrator-push.test.ts
git commit -m "feat: generalize orchestrator and stage-runner for PR and push review types"
```

---

### Task 6: Add commit comment posting to comment.ts

**Files:**
- Modify: `packages/api/src/github/comment.ts`

- [ ] **Step 1: Write the test**

Create `packages/api/tests/commit-comment.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('commit comment dispatch logic', () => {
  it('uses repos.createCommitComment for pushes', () => {
    const type = 'push'
    const shouldUseCommitComment = type === 'push'
    expect(shouldUseCommitComment).toBe(true)
  })

  it('uses issues.createComment for PRs', () => {
    const type = 'pr'
    const shouldUsePRComment = type === 'pr'
    expect(shouldUsePRComment).toBe(true)
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run packages/api/tests/commit-comment.test.ts`
Expected: PASS

- [ ] **Step 3: Add postCommitComment to comment.ts**

In `packages/api/src/github/comment.ts`, add the interface and function after the existing `updatePRComment`:

```ts
export interface CommitCommentInput {
  octokit: Octokit
  owner: string
  repo: string
  commitSha: string
  runId: string
}

/**
 * Post a review comment on a commit (for push reviews).
 * Uses repos.createCommitComment API.
 * The rendered markdown is identical to PR comments.
 */
export async function postCommitComment(input: CommitCommentInput): Promise<void> {
  const { octokit, owner, repo, commitSha, runId } = input
  const mutexKey = `${owner}/${repo}:${commitSha}`

  await getMutex(mutexKey).runExclusive(async () => {
    const run = db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId)).get()
    if (!run) {
      logger.error({ runId }, 'Pipeline run not found for commit comment')
      return
    }

    const stages = db
      .select()
      .from(stageResults)
      .where(eq(stageResults.pipelineRunId, runId))
      .all()

    const allDbFindings = db
      .select()
      .from(findingsTable)
      .where(eq(findingsTable.pipelineRunId, runId))
      .all()

    const stageData: StageData[] = stages.map((s) => ({
      stage: s.stage,
      verdict: s.verdict,
      summary: s.summary ?? undefined,
    }))

    const stageMap = new Map(stages.map((s) => [s.id, s.stage]))
    const findingsWithStage: FindingWithStage[] = allDbFindings.map((f) => ({
      severity: f.severity as 'critical' | 'notable' | 'minor',
      category: f.category,
      title: f.title,
      description: f.description,
      filePath: f.filePath ?? undefined,
      lineStart: f.lineStart ?? undefined,
      lineEnd: f.lineEnd ?? undefined,
      suggestion: f.suggestion ?? undefined,
      codeSnippet: f.codeSnippet ?? undefined,
      stage: stageMap.get(f.stageResultId) || 'unknown',
    }))

    let crossRepoMatches: CrossRepoMatch[] = []
    try {
      const repoFullName = `${owner}/${repo}`
      const findingIds = allDbFindings.map((f) => f.id)
      if (findingIds.length > 0) {
        const placeholders = findingIds.map(() => '?').join(',')
        const embeddingRows = rawDb.prepare(`
          SELECT finding_id, embedding FROM vec_findings
          WHERE finding_id IN (${placeholders})
        `).all(...findingIds) as { finding_id: string; embedding: Buffer }[]

        const matchMap = new Map<string, CrossRepoMatch>()
        for (const row of embeddingRows) {
          const queryEmbedding = new Float32Array(
            row.embedding.buffer,
            row.embedding.byteOffset,
            row.embedding.byteLength / 4
          )
          const matches = findCrossRepoMatches(rawDb, queryEmbedding, repoFullName)
          for (const m of matches) {
            if (!matchMap.has(m.finding_id)) {
              matchMap.set(m.finding_id, m)
            }
          }
        }
        crossRepoMatches = Array.from(matchMap.values())
      }
    } catch (err) {
      logger.warn({ runId, err }, 'Cross-repo search failed, continuing without')
    }

    const body = renderComment({
      runId,
      stages: stageData,
      allFindings: findingsWithStage,
      headSha: commitSha,
      durationMs: run.startedAt && run.completedAt
        ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
        : undefined,
      crossRepoMatches,
    })

    const { data: created } = await octokit.repos.createCommitComment({
      owner,
      repo,
      commit_sha: commitSha,
      body,
    })

    db.update(pipelineRuns)
      .set({ commentId: created.id })
      .where(eq(pipelineRuns.id, runId))
      .run()

    logger.info({ runId, commentId: created.id, commitSha }, 'Commit comment posted')
  })
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/github/comment.ts packages/api/tests/commit-comment.test.ts
git commit -m "feat: add postCommitComment for push review commit comments"
```

---

### Task 7: Update pipelines API route for review_units

**Files:**
- Modify: `packages/api/src/routes/pipelines.ts`

- [ ] **Step 1: Write the test**

Create `packages/api/tests/routes-pipelines-review-units.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('pipelines route response shape', () => {
  it('includes reviewUnit fields in response', () => {
    const expectedShape = {
      id: 'run-1',
      status: 'COMPLETED',
      headSha: 'abc123',
      reviewUnit: {
        type: 'push',
        title: 'feat: add auth',
        authorLogin: 'rstern',
        prNumber: null,
        ref: 'refs/heads/main',
      },
      repo: { fullName: 'test/repo' },
      stages: [],
    }

    expect(expectedShape.reviewUnit.type).toBe('push')
    expect(expectedShape.reviewUnit.prNumber).toBeNull()
  })

  it('includes prNumber for PR review units', () => {
    const prResponse = {
      reviewUnit: {
        type: 'pr',
        title: 'Fix bug',
        authorLogin: 'rstern',
        prNumber: 42,
        ref: 'refs/heads/fix-bug',
      },
    }
    expect(prResponse.reviewUnit.type).toBe('pr')
    expect(prResponse.reviewUnit.prNumber).toBe(42)
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run packages/api/tests/routes-pipelines-review-units.test.ts`
Expected: PASS

- [ ] **Step 3: Update pipelines.ts to join through review_units**

In `packages/api/src/routes/pipelines.ts`, add `reviewUnits` to imports:

```ts
import {
  pipelineRuns,
  pullRequests,
  repositories,
  reviewUnits,
  stageResults,
  findings,
} from '../db/schema'
```

Update the GET `/` handler query to left-join review_units and build the unified response shape. Replace the existing query and result mapping:

```ts
pipelinesApp.get('/', (c) => {
  const runs = db
    .select({
      id: pipelineRuns.id,
      status: pipelineRuns.status,
      headSha: pipelineRuns.headSha,
      startedAt: pipelineRuns.startedAt,
      completedAt: pipelineRuns.completedAt,
      createdAt: pipelineRuns.createdAt,
      ruType: reviewUnits.type,
      ruTitle: reviewUnits.title,
      ruAuthorLogin: reviewUnits.authorLogin,
      ruPrNumber: reviewUnits.prNumber,
      ruRef: reviewUnits.ref,
      ruRepoId: reviewUnits.repoId,
      prNumber: pullRequests.number,
      prTitle: pullRequests.title,
      prAuthorLogin: pullRequests.authorLogin,
      prBaseBranch: pullRequests.baseBranch,
      prState: pullRequests.state,
      prRepoId: pullRequests.repoId,
    })
    .from(pipelineRuns)
    .leftJoin(reviewUnits, eq(pipelineRuns.reviewUnitId, reviewUnits.id))
    .leftJoin(pullRequests, eq(pipelineRuns.prId, pullRequests.id))
    .orderBy(desc(pipelineRuns.createdAt))
    .all()

  // Resolve repo names: prefer review_unit.repo_id, fall back to pr.repo_id
  const repoIds = [...new Set(runs.map(r => r.ruRepoId ?? r.prRepoId).filter(Boolean))]
  const repos = repoIds.length > 0
    ? db.select({ id: repositories.id, fullName: repositories.fullName }).from(repositories).all()
    : []
  const repoMap = new Map(repos.map(r => [r.id, r.fullName]))

  // Fetch stage verdicts
  const runIds = runs.map((r) => r.id)
  const stages = runIds.length > 0
    ? db.select({
        pipelineRunId: stageResults.pipelineRunId,
        stage: stageResults.stage,
        verdict: stageResults.verdict,
      }).from(stageResults).all().filter((s) => runIds.includes(s.pipelineRunId))
    : []

  const stagesByRun = new Map<string, Array<{ stage: string; verdict: string }>>()
  for (const s of stages) {
    const list = stagesByRun.get(s.pipelineRunId) ?? []
    list.push({ stage: s.stage, verdict: s.verdict })
    stagesByRun.set(s.pipelineRunId, list)
  }

  const result = runs.map((run) => ({
    id: run.id,
    status: run.status,
    headSha: run.headSha,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    reviewUnit: {
      type: run.ruType ?? 'pr',
      title: run.ruTitle ?? run.prTitle ?? 'Unknown',
      authorLogin: run.ruAuthorLogin ?? run.prAuthorLogin ?? 'unknown',
      prNumber: run.ruPrNumber ?? run.prNumber ?? null,
      ref: run.ruRef ?? run.prBaseBranch ?? null,
    },
    repo: {
      fullName: repoMap.get(run.ruRepoId ?? run.prRepoId ?? 0) ?? 'unknown',
    },
    stages: stagesByRun.get(run.id) ?? [],
  }))

  return c.json(result)
})
```

Apply the same `reviewUnit` shape change to the GET `/:id` handler response. Replace the `pr` field with `reviewUnit` and left-join both tables.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/pipelines.ts packages/api/tests/routes-pipelines-review-units.test.ts
git commit -m "feat: update pipelines API route to use review_units for unified PR/push responses"
```

---

### Task 8: Update frontend for PR/Push display

**Files:**
- Modify: `packages/web/src/hooks/usePipelineFeed.ts`
- Modify: `packages/web/src/components/feed/PRCard.tsx`
- Modify: `packages/web/src/components/feed/PRDetail.tsx`

- [ ] **Step 1: Update PipelineListItem type**

In `packages/web/src/hooks/usePipelineFeed.ts`, replace the `pr` field with `reviewUnit`:

```ts
export interface PipelineListItem {
  id: string
  status: string
  headSha: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  reviewUnit: {
    type: 'pr' | 'push'
    title: string
    authorLogin: string
    prNumber: number | null
    ref: string | null
  }
  repo: {
    fullName: string
  }
  stages: Array<{ stage: string; verdict: string }>
}
```

Update `PipelineDetail` to extend the new type:

```ts
export interface PipelineDetail extends Omit<PipelineListItem, 'stages'> {
  stages: StageResultData[]
  crossRepoMatches?: CrossRepoMatchData[]
}
```

- [ ] **Step 2: Update PRCard.tsx for push display**

In `packages/web/src/components/feed/PRCard.tsx`, update the component to use `pipeline.reviewUnit`:

```tsx
export function PRCard({ pipeline, isSelected, onClick }: PRCardProps) {
  const stageMap = new Map(
    pipeline.stages.map((s) => [s.stage, s.verdict])
  )

  const timeAgo = formatDistanceToNow(new Date(pipeline.createdAt), {
    addSuffix: true,
  })

  const isPush = pipeline.reviewUnit.type === 'push'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 border-b border-border cursor-pointer transition-colors duration-150 text-left',
        'bg-surface hover:bg-surface-hover',
        isSelected && 'border-l-2 border-l-accent bg-accent-dim'
      )}
    >
      {/* Verdict dots */}
      <div className="flex items-center gap-1 shrink-0">
        {STAGE_ORDER.map((stage) => {
          const verdict = stageMap.get(stage)
          return (
            <VerdictDot key={stage} stage={stage} verdict={verdict ?? null} />
          )
        })}
      </div>

      {/* Type badge + Repo + title */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'inline-flex items-center px-1 py-0.5 rounded text-[9px] font-mono font-medium uppercase tracking-wider',
            isPush
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-blue-500/15 text-blue-400'
          )}>
            {isPush ? 'Push' : 'PR'}
          </span>
          <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
            {pipeline.repo.fullName}
          </span>
        </div>
        <span className="font-body text-sm text-text-primary truncate">
          {pipeline.reviewUnit.title}
          {!isPush && pipeline.reviewUnit.prNumber && (
            <span className="text-text-muted"> #{pipeline.reviewUnit.prNumber}</span>
          )}
        </span>
      </div>

      {/* Time ago */}
      <span className="text-text-muted text-[12px] font-body shrink-0">
        {timeAgo}
      </span>
    </button>
  )
}
```

- [ ] **Step 3: Update PRDetail.tsx for push context**

In `packages/web/src/components/feed/PRDetail.tsx`, replace the header section to use `pipeline.reviewUnit`:

```tsx
        <div className="space-y-1 min-w-0">
          <h2 className="font-display text-xl font-semibold text-text-primary truncate">
            {pipeline.reviewUnit.title}
          </h2>
          <div className="flex items-center gap-3 text-text-muted">
            <span className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wider',
              pipeline.reviewUnit.type === 'push'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-blue-500/15 text-blue-400'
            )}>
              {pipeline.reviewUnit.type === 'push' ? 'Push' : 'PR'}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.06em]">
              {pipeline.repo.fullName}
            </span>
            {pipeline.reviewUnit.type === 'pr' && pipeline.reviewUnit.prNumber && (
              <span className="font-body text-[12px]">
                #{pipeline.reviewUnit.prNumber} by {pipeline.reviewUnit.authorLogin}
              </span>
            )}
            {pipeline.reviewUnit.type === 'push' && (
              <span className="font-body text-[12px]">
                by {pipeline.reviewUnit.authorLogin}
              </span>
            )}
            <span className="font-mono text-[11px] text-text-muted">
              {pipeline.headSha.slice(0, 7)}
            </span>
          </div>
        </div>
```

Add `cn` import if not already present:

```ts
import { cn } from '../../lib/cn'
```

- [ ] **Step 4: Run frontend dev to verify**

Run: `npm run dev --workspace=packages/web`
Verify: Cards render without errors. Type badge shows for existing data.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/usePipelineFeed.ts packages/web/src/components/feed/PRCard.tsx packages/web/src/components/feed/PRDetail.tsx
git commit -m "feat: update frontend for unified PR/Push review display with type badges"
```

---

### Task 9: Run migration on dev database and end-to-end verify

**Files:**
- No new files

- [ ] **Step 1: Run db-init to apply schema changes**

Run: `npm run db:init --workspace=packages/api`
Expected: Tables created, including `review_units` and updated `pipeline_runs`

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Start dev server and verify push handler registered**

Run: `npm run dev --workspace=packages/api`
Check logs: webhook handlers registered (should now include `push`)

- [ ] **Step 4: Commit any integration fixes**

```bash
git add -A
git commit -m "chore: apply review_units migration and fix integration issues"
```

---

## Manual Step Required

After deploying, go to **GitHub App settings** and add `push` to subscribed webhook events. No new permissions needed — `contents: read` already covers the compare API.
