# Phase 19: GitHub Star Intelligence - Research

**Researched:** 2026-03-16
**Phase Goal:** GitHub stars are synced, categorized by intent, and linked to local projects -- turning a flat list into curated intelligence
**Requirements:** STAR-01, STAR-03, STAR-04, STAR-05, STAR-07

## Codebase Patterns & Conventions

### 1. GitHub API via `gh` CLI

**Source:** `packages/api/src/services/project-scanner.ts`

The project uses `execFile('gh', ['api', ...])` with `promisify(execFileCb)`. Key patterns:

```typescript
const execFile = promisify(execFileCb);
const GH_TIMEOUT = 15_000; // 15 seconds for GitHub API calls

// Single API call:
const result = await execFile("gh", ["api", `repos/${owner}/${repo}`, "--jq", ".private"], {
  timeout: GH_TIMEOUT,
});

// Pagination via --paginate:
const result = await execFile("gh", ["api", "--paginate", "user/starred", ...], {
  timeout: GH_TIMEOUT,
});
```

**Star API specifics:**
- Endpoint: `user/starred`
- Accept header: `application/vnd.github.v3.star+json` (returns `starred_at` timestamps)
- `gh api` supports `--paginate` natively, handles link header traversal
- `--jq` for server-side filtering
- Response is array of `{ starred_at, repo: { id, full_name, description, language, topics, html_url, ... } }`

**Rate limit checking:**
```bash
gh api rate_limit --jq '.rate.remaining'
```

### 2. AI Categorization Pattern

**Source:** `packages/api/src/services/ai-categorizer.ts`

```typescript
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

export const CONFIDENCE_THRESHOLD = 0.6;

// Check if AI is available
export function isAIAvailable(): boolean {
  return Boolean(process.env["GEMINI_API_KEY"] || process.env["GOOGLE_GENERATIVE_AI_API_KEY"]);
}

// Schema for structured output
const categorizationSchema = z.object({
  projectSlug: z.string().nullable().describe("..."),
  confidence: z.number().min(0).max(1).describe("..."),
  reasoning: z.string().describe("..."),
});

// Use generateText + Output.object for structured output
const { output } = await generateText({
  model: google(modelId),
  output: Output.object({ schema: categorizationSchema }),
  prompt: `...`,
});

// Graceful fallback on failure
if (!output) {
  return { projectSlug: null, confidence: 0, reasoning: "AI categorization failed" };
}

// Apply confidence threshold
if (output.confidence < CONFIDENCE_THRESHOLD) { ... }
```

**Model:** `process.env["AI_MODEL"] ?? "gemini-3-flash-preview"`

### 3. Persist-First, Enrich-Later Pattern

**Source:** `packages/api/src/services/enrichment.ts` + `packages/api/src/routes/captures.ts`

```typescript
// In route handler after persisting capture:
queueMicrotask(() => {
  enrichCapture(getInstance().db, capture.id).catch((err) => {
    console.error(`Enrichment failed for capture ${capture.id}:`, err);
  });
});
```

The enrichment function:
1. Sets status to "pending_enrichment"
2. Fetches fresh data
3. Runs AI categorization
4. Persists enrichment results + status = "enriched"
5. Emits SSE event

### 4. Event Bus Pattern

**Source:** `packages/api/src/services/event-bus.ts`

```typescript
export type MCEventType =
  | "capture:created"
  | "capture:enriched"
  // ... existing types
  | "budget:updated";

export interface MCEvent {
  type: MCEventType;
  id: string;
  data?: Record<string, unknown>;
}

// Emit:
eventBus.emit("mc:event", { type: "capture:enriched", id: captureId });
```

New event types needed: `"star:synced"`, `"star:categorized"`

### 5. Database Query Pattern

**Source:** `packages/api/src/db/queries/captures.ts`

```typescript
import { eq, and, sql, lt, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../index.js";
import { captures } from "../schema.js";
import { notFound } from "../../lib/errors.js";
import type { CreateCapture, ... } from "@mission-control/shared";

// Create with nanoid:
export function createCapture(db: DrizzleDb, data: CreateCapture) {
  const now = new Date();
  const id = nanoid();
  db.insert(captures).values({ ... }).run();
  return getCapture(db, id);
}

// Get with error:
export function getCapture(db: DrizzleDb, id: string) {
  const result = db.select().from(captures).where(eq(captures.id, id)).get();
  if (!result) throw notFound(`Capture ${id} not found`);
  return result;
}

// List with query params:
export function listCaptures(db: DrizzleDb, query: ListCapturesQuery) {
  const conditions = [];
  if (query.projectId) conditions.push(eq(captures.projectId, query.projectId));
  // ...
  return db.select().from(captures).where(and(...conditions)).limit(query.limit).offset(query.offset).all();
}
```

### 6. Route Pattern

**Source:** `packages/api/src/routes/captures.ts`

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createCaptureSchema, ... } from "@mission-control/shared";
import type { DatabaseInstance } from "../db/index.js";

export function createCaptureRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .post("/captures", zValidator("json", createCaptureSchema), (c) => { ... })
    .get("/captures", zValidator("query", listCapturesQuerySchema), (c) => { ... })
    .get("/captures/:id", zValidator("param", captureIdSchema), (c) => { ... })
    .patch("/captures/:id", zValidator("param", captureIdSchema), zValidator("json", updateCaptureSchema), (c) => { ... })
    .delete("/captures/:id", zValidator("param", captureIdSchema), (c) => { ... });
}
```

### 7. App Registration Pattern

**Source:** `packages/api/src/app.ts`

```typescript
const app = new Hono()
  .route("/api", createHealthRoutes(() => config ?? null))
  .route("/api", createCaptureRoutes(getInstance))
  // ... method chaining for RPC type graph
  .route("/api", createBudgetRoutes(getInstance, () => config ?? null));
```

Routes are chained for TypeScript RPC type graph preservation.

### 8. Server Timer Pattern

**Source:** `packages/api/src/index.ts`

```typescript
// Start background poll (every 5 minutes)
pollTimer = startBackgroundPoll(config, db, 300_000, sqlite);

// Start session reaper (marks stale sessions as abandoned)
reaperTimer = startSessionReaper(reaperDb, 180_000, reaperSqlite);

// Cleanup in shutdown:
function shutdown() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  // ...
}
```

### 9. normalizeRemoteUrl Pattern

**Source:** `packages/api/src/services/git-health.ts:182`

```typescript
export function normalizeRemoteUrl(url: string): string {
  // Strips protocol, trailing slash, .git suffix
  // Handles SSH (git@host:owner/repo) and HTTPS formats
  // Returns: "github.com/owner/repo"
}
```

Star fullName (e.g., "owner/repo") needs to be compared against normalized remote URLs from tracked projects (format: "github.com/owner/repo"). The match is: `normalizedRemoteUrl.endsWith("/" + star.fullName)`.

### 10. Schema Table Pattern (Phase 16)

**Source:** `.planning/phases/16-data-foundation/16-01-PLAN.md`

The stars table (defined in Phase 16) uses:
- `githubId: integer("github_id").primaryKey()` — NOT nanoid, uses GitHub's numeric ID
- `topics: text("topics")` — JSON array stored as text, parsed on API response
- `userOverride: integer("user_override", { mode: "boolean" }).default(false)`
- `intent: text("intent", { enum: ["reference", "tool", "try", "inspiration"] })`
- `aiConfidence: real("ai_confidence")`

### 11. Config Access Pattern

**Source:** `packages/api/src/lib/config.ts` (Phase 16 adds `discovery` section)

```typescript
const discoveryConfigSchema = z.object({
  paths: z.array(z.string()).default(["~"]),
  scanIntervalMinutes: z.number().int().min(5).default(60),
  githubOrgs: z.array(z.string()).default(["quartermint", "vanboompow"]),
  starSyncIntervalHours: z.number().int().min(1).default(6),
});
```

Star sync interval comes from `config.discovery.starSyncIntervalHours` (default: 6 hours).

## Implementation Architecture

### Service Layer: `star-service.ts`

New service file at `packages/api/src/services/star-service.ts` handles:

1. **fetchStarsFromGitHub()** — Calls `gh api --paginate user/starred` with star header
2. **syncStars()** — Orchestrator: check rate limit → fetch → persist → enrich
3. **categorizeStarIntent()** — AI categorization for a single star
4. **enrichUncategorizedStars()** — Batch AI categorization for stars with null intent
5. **linkStarsToProjects()** — Matches star fullName against tracked project remote URLs
6. **startStarSync()** — setInterval timer (configurable, default 6h)

### Query Layer: `stars.ts`

New query file at `packages/api/src/db/queries/stars.ts` handles:

1. **upsertStar()** — Insert or update by githubId (ON CONFLICT)
2. **getStar()** — Get single star by githubId
3. **listStars()** — List with intent/language/search filters
4. **updateStarIntent()** — PATCH intent + set userOverride=true, aiConfidence=null
5. **getUncategorizedStars()** — Stars with intent=null AND userOverride=false
6. **getLatestStarredAt()** — Max starred_at for incremental sync

### Route Layer: `stars.ts`

New route file at `packages/api/src/routes/stars.ts`:

- `GET /api/stars` — List stars with query filters
- `GET /api/stars/:githubId` — Get single star
- `PATCH /api/stars/:githubId/intent` — Override intent category
- `POST /api/stars/sync` — Trigger manual sync

### Timer Integration

In `packages/api/src/index.ts`, add star sync timer alongside existing timers:

```typescript
let starSyncTimer: ReturnType<typeof setInterval> | null = null;
if (config) {
  starSyncTimer = startStarSync(config, db, sqlite);
}
// + shutdown cleanup
```

## Technical Considerations

### gh api --paginate Output Format

`gh api --paginate` concatenates all pages into a single JSON array. With `--jq`, you can transform server-side. The full output for stars with the star header is:

```json
[
  {
    "starred_at": "2024-01-15T10:30:00Z",
    "repo": {
      "id": 12345,
      "full_name": "owner/repo",
      "description": "A description",
      "language": "TypeScript",
      "topics": ["tag1", "tag2"],
      "html_url": "https://github.com/owner/repo"
    }
  }
]
```

Using `--jq` to flatten: `.[] | { starred_at, id: .repo.id, full_name: .repo.full_name, ... }` keeps output manageable.

### Rate Limit Guard

Check BEFORE syncing, not during:
```typescript
const result = await execFile("gh", ["api", "rate_limit", "--jq", ".rate.remaining"]);
const remaining = parseInt(result.stdout.trim(), 10);
if (remaining < 500) { /* skip sync */ }
```

500 threshold protects project scan budget (which also uses `gh api`).

### Incremental Sync

Stars API returns newest-first. Use `getLatestStarredAt()` from DB to stop pagination early when we hit known stars. However, `gh api --paginate` fetches all pages — so for efficiency, we fetch all then filter in JS. For large star counts (>1000), this is still fast since `gh api` handles pagination internally.

Alternative: use `--jq` filter to only emit stars after a certain date, but this still fetches all pages from GitHub. The real savings is in not re-enriching already-categorized stars.

### Star-to-Project Linking

Matching logic:
1. Fetch all tracked projects with their remote URLs (from copies table or project scan data)
2. For each star, normalize `https://github.com/${star.fullName}` using `normalizeRemoteUrl()`
3. Compare against normalized remote URLs of tracked projects
4. If match found, set `projectSlug` on the star record

This runs as part of the sync cycle (not a separate timer).

### Batch AI Categorization

Stars can accumulate many uncategorized entries. Process in batches:
- Batch size: 10 stars per Gemini call (concurrency limit)
- Each star gets its own `generateText` call (not batch prompting)
- Use `p-limit` (already a dependency) to control concurrency
- Rate limiting: Gemini free tier = 15 RPM, so limit to ~10 concurrent calls

### userOverride Behavior

When user overrides intent:
1. Set `intent` to the new value
2. Set `aiConfidence` to null (signals human decision)
3. Set `userOverride` to true
4. Future AI enrichment passes skip stars with `userOverride=true`

## Validation Architecture

### Test Categories

1. **Star sync service tests** — Mock gh CLI, verify parse, persist, incremental logic
2. **AI categorization tests** — Mock Gemini, verify schema, confidence threshold, fallback
3. **Star query tests** — Drizzle queries against in-memory SQLite
4. **Star route tests** — Hono test client, HTTP verbs, validation
5. **Star-to-project linking tests** — URL normalization matching
6. **Rate limit guard tests** — Mock gh api rate_limit, verify skip logic

### Nyquist Dimensions

- **Correctness**: Stars synced match GitHub state; AI categories are one of 4 valid intents
- **Resilience**: Graceful degradation when Gemini is down, when gh CLI fails, when rate limit exceeded
- **Idempotency**: Re-sync doesn't create duplicates (upsert by githubId)
- **Integration**: Timer starts on server boot, events emit on sync, routes respond correctly

## Dependencies

### Phase 16 (Data Foundation) — MUST be complete first

Phase 19 depends on these Phase 16 artifacts:
- `packages/api/src/db/schema.ts` — `stars` table definition
- `packages/shared/src/schemas/star.ts` — `starSchema`, `starIntentEnum`, `createStarSchema`, `updateStarIntentSchema`, `listStarsQuerySchema`, `starIdSchema`
- `packages/shared/src/types/index.ts` — `Star`, `StarIntent`, `CreateStar`, `UpdateStarIntent`, `ListStarsQuery`
- `packages/api/src/lib/config.ts` — `config.discovery.starSyncIntervalHours`

### Existing Dependencies (no new npm packages needed)

- `ai` + `@ai-sdk/google` — Already used by ai-categorizer.ts
- `p-limit` — Already used by project-scanner.ts
- `nanoid` — NOT needed (stars use githubId as PK, not nanoid)
- `drizzle-orm` + `better-sqlite3` — Already used throughout

## RESEARCH COMPLETE
