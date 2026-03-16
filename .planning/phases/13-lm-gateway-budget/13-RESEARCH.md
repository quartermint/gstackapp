# Phase 13: LM Gateway + Budget - Research

**Researched:** 2026-03-16
**Domain:** LM Studio health probing, budget calculation from session data, tier routing recommendations
**Confidence:** HIGH

## Summary

Phase 13 adds two independent but related capabilities to Mission Control: (1) LM Studio health monitoring on the Mac Mini, and (2) budget awareness derived from the sessions table built in Phase 11/12. Both are read-only features that query existing data or external services -- no new database tables needed, no new npm dependencies.

The LM Studio health probe polls `GET http://100.123.8.125:1234/v1/models` every 30 seconds and derives three-state health (unavailable/loading/ready) from the HTTP response and the `state` field on model objects. The budget service queries the existing sessions table with a simple `GROUP BY tier` aggregation over a configurable weekly window. Tier routing recommendations are rule-based keyword matching on task descriptions, producing suggestions that never auto-restrict.

**Primary recommendation:** Build these as two independent services (lm-studio.ts, budget-service.ts) with two new route files (models.ts, budget.ts), following the existing factory pattern. The SessionStart hook response should be enriched to include budget context when burn rate exceeds "moderate" -- this is the key integration point that makes budget data actionable at the moment of decision.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Budget Display:** Show session counts + burn rate indicator, NO dollar estimates. Weekly view: "5 Opus / 12 Sonnet / 3 Local" with a visual burn rate (low/moderate/hot). Burn rate is relative to a configurable weekly threshold (e.g., 20 Opus sessions/week = "hot"). No dollar amounts until real billing data is available for calibration. All budget data is informational -- never blocks, restricts, or gates sessions.
- **Budget Placement:** Dashboard widget (passive awareness) AND hook response banner (active decision support at Claude Code session start). SessionStart hook response includes budget context when burn rate exceeds "moderate" threshold.
- **Tier Routing Recommendations:** Rule-based keyword matching on task description. "architecture", "design", "complex", "plan" -> suggest Opus. "test", "fix", "refactor", "update" -> suggest Sonnet. "scaffold", "boilerplate", "template" -> suggest Local. Budget burn rate overrides: if Opus is "hot", suggest downgrading eligible tasks. Suggestions only -- never auto-route or restrict.
- **LM Studio Health Probe:** Poll `GET http://100.123.8.125:1234/v1/models` on 30-second timer. Three-state health: unavailable (API down), loading (API up, no model loaded), ready (model in list). Surface in existing health panel alongside Mac Mini system metrics. If LM Studio is unavailable, tier router should not suggest Local tier.
- **Budget Calculation:** Derived from sessions table: `SELECT modelTier, COUNT(*) FROM sessions WHERE startedAt > weekStart GROUP BY modelTier`. No separate budget_entries table needed -- query sessions directly. Weekly reset based on configurable day (default: Friday, matching Claude billing cycle).

### Code Context (from CONTEXT.md)
- New files: `packages/api/src/services/lm-studio.ts`, `packages/api/src/services/budget-service.ts`, `packages/api/src/routes/budget.ts`, `packages/api/src/routes/models.ts`
- Integration: Add LM Studio as a ServiceEntry in health monitor, query budget service in SessionStart hook response, consider merging into existing route groups to reduce Hono RPC type chain depth

### Deferred Ideas (OUT OF SCOPE)
- Dollar cost estimates once calibrated against real Claude billing
- Smart routing with learning from historical outcomes (v1.3+)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GATE-01 | MC health probe polls LM Studio API on Mac Mini (:1234) for model availability | LM Studio `/v1/models` endpoint returns model list with `state` field; 30s setInterval timer pattern from index.ts; module-level cache pattern |
| GATE-02 | Three-state model health: unavailable / loading / ready (Qwen3-Coder-30B) | `state: "not-loaded" \| "loaded"` from LM Studio API; HTTP error = unavailable; API up + model not in list or not-loaded = loading; model loaded = ready |
| GATE-03 | LM Studio status surfaced in existing health panel | Existing `ServiceStatus` type in health-monitor.ts needs extension; health panel component already renders services list |
| BUDG-02 | Weekly budget summary shows session count by tier with estimated cost range | Query sessions table directly with Drizzle `sql` template; GROUP BY tier WHERE startedAt > weekStart; no new tables |
| BUDG-03 | Tier routing recommendations suggest model based on budget burn rate (rule-based, not AI) | Keyword matching on taskDescription field; burn rate thresholds configurable; LM Studio availability gates Local suggestions |
| BUDG-04 | Budget estimates clearly labeled as "estimated" -- never auto-restrict, suggestions only | All response schemas include `isEstimated: true` flag; routing is advisory only |
| API-05 | GET /api/budget -- weekly summary by tier with estimated costs | New route file `routes/budget.ts` with factory pattern; returns tier counts + burn rate level |
| API-06 | GET /api/models -- LM Studio model status and availability | New route file `routes/models.ts` with factory pattern; returns cached probe results |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | ^4.6.0 | Route definitions for /api/budget and /api/models | Already used for all API routes |
| Drizzle ORM | ^0.38.0 | Query sessions table for budget aggregation | Already used for all DB queries |
| Zod | ^3.24.0 | Schema validation for budget/models responses | Already used for all API boundaries |
| better-sqlite3 | ^11.7.0 | SQLite queries for session counts | Already the database driver |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js http (built-in) | - | HTTP GET for LM Studio health probe | Polling /v1/models endpoint |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw HTTP fetch for LM Studio probe | @ai-sdk/openai-compatible | Over-engineered for a simple GET; that package is for inference, not health checks |
| Separate budget_entries table | Query sessions directly | CONTEXT.md locks this: derive from sessions, no separate table |
| node-cron for probe timer | setInterval | setInterval is the project convention (project-scanner, session-reaper) |

**Installation:**
```bash
# No new dependencies needed. All capabilities built on existing stack.
```

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
├── services/
│   ├── lm-studio.ts          # NEW: LM Studio health probe + cache
│   └── budget-service.ts     # NEW: Budget calculation + routing suggestions
├── routes/
│   ├── models.ts             # NEW: GET /api/models
│   └── budget.ts             # NEW: GET /api/budget
├── lib/
│   └── config.ts             # MODIFIED: Add budget thresholds + LM Studio config
packages/shared/src/
├── schemas/
│   ├── budget.ts             # NEW: Budget response schemas
│   └── models.ts             # NEW: Model status schemas (or extend session.ts)
```

### Pattern 1: Background Timer with Module-Level Cache (LM Studio Probe)
**What:** Poll LM Studio every 30 seconds, cache result in module scope. Routes read from cache (zero latency).
**When to use:** LM Studio health endpoint, same pattern as project scanner's background poll.
**Example:**
```typescript
// packages/api/src/services/lm-studio.ts
// Source: Existing pattern from project-scanner.ts + session-service.ts

export type LmStudioHealth = "unavailable" | "loading" | "ready";

export interface LmStudioStatus {
  health: LmStudioHealth;
  modelId: string | null;
  lastChecked: Date;
}

// Module-level cache -- routes read this directly
let cachedStatus: LmStudioStatus = {
  health: "unavailable",
  modelId: null,
  lastChecked: new Date(),
};

const LM_STUDIO_URL = "http://100.123.8.125:1234/v1/models";
const TARGET_MODEL = "qwen3-coder-30b"; // Partial match

export async function probeLmStudio(): Promise<LmStudioStatus> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(LM_STUDIO_URL, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      cachedStatus = { health: "unavailable", modelId: null, lastChecked: new Date() };
      return cachedStatus;
    }

    const body = await res.json() as { data?: Array<{ id: string; state?: string }> };
    const models = body.data ?? [];

    // Find target model
    const target = models.find(m => m.id.toLowerCase().includes(TARGET_MODEL));

    if (!target) {
      // API up but target model not found
      cachedStatus = { health: "loading", modelId: null, lastChecked: new Date() };
    } else if (target.state === "loaded") {
      cachedStatus = { health: "ready", modelId: target.id, lastChecked: new Date() };
    } else {
      // Model exists but not loaded
      cachedStatus = { health: "loading", modelId: target.id, lastChecked: new Date() };
    }

    return cachedStatus;
  } catch {
    cachedStatus = { health: "unavailable", modelId: null, lastChecked: new Date() };
    return cachedStatus;
  }
}

export function getLmStudioStatus(): LmStudioStatus {
  return cachedStatus;
}

export function startLmStudioProbe(intervalMs = 30_000): ReturnType<typeof setInterval> {
  // Run immediately on start
  probeLmStudio().catch(() => {});
  return setInterval(() => {
    probeLmStudio().catch(() => {});
  }, intervalMs);
}
```

### Pattern 2: Budget Service as Pure Query Functions
**What:** Stateless functions that query the sessions table and compute burn rate. No separate state, no accumulation tables.
**When to use:** Budget calculation, tier routing.
**Example:**
```typescript
// packages/api/src/services/budget-service.ts
// Source: Follows captures.ts / sessions.ts query pattern

import { sql, eq } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { sessions } from "../db/schema.js";

export type BurnRate = "low" | "moderate" | "hot";

export interface WeeklyBudget {
  weekStart: string;  // ISO date
  opus: number;
  sonnet: number;
  local: number;
  unknown: number;
  burnRate: BurnRate;
  isEstimated: true;
}

export interface BudgetThresholds {
  weeklyOpusHot: number;     // e.g., 20
  weeklyOpusModerate: number; // e.g., 10
  weekResetDay: number;       // 0=Sunday, 5=Friday
}

export function getWeekStart(now: Date, resetDay: number): Date {
  const d = new Date(now);
  // Walk back to the most recent resetDay
  while (d.getDay() !== resetDay) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeeklyBudget(
  db: DrizzleDb,
  thresholds: BudgetThresholds,
  now: Date = new Date()
): WeeklyBudget {
  const weekStart = getWeekStart(now, thresholds.weekResetDay);

  const rows = db
    .select({
      tier: sessions.tier,
      count: sql<number>`count(*)`,
    })
    .from(sessions)
    .where(sql`${sessions.startedAt} >= ${weekStart.getTime() / 1000}`)
    .groupBy(sessions.tier)
    .all();

  const counts = { opus: 0, sonnet: 0, local: 0, unknown: 0 };
  for (const row of rows) {
    if (row.tier in counts) {
      counts[row.tier as keyof typeof counts] = row.count;
    }
  }

  let burnRate: BurnRate = "low";
  if (counts.opus >= thresholds.weeklyOpusHot) {
    burnRate = "hot";
  } else if (counts.opus >= thresholds.weeklyOpusModerate) {
    burnRate = "moderate";
  }

  return {
    weekStart: weekStart.toISOString(),
    ...counts,
    burnRate,
    isEstimated: true,
  };
}
```

### Pattern 3: Route Factory with Dependency Injection
**What:** Same pattern as every other route file -- factory function receiving `getInstance` and optionally config.
**When to use:** Both new route files.
**Example:**
```typescript
// packages/api/src/routes/models.ts
export function createModelRoutes() {
  return new Hono()
    .get("/models", (c) => {
      const status = getLmStudioStatus();
      return c.json({ lmStudio: status });
    });
}
```

### Pattern 4: SessionStart Hook Response Enrichment
**What:** The existing `/sessions/hook/start` endpoint returns a JSON response. Claude Code's HTTP hooks can read this response. Enrich it with budget context when burn rate is elevated.
**When to use:** When burn rate >= "moderate" and the user starts a new session.
**Critical insight:** This is the key integration point. The hook response body is how budget awareness reaches Claude Code at the moment of decision.
**Example:**
```typescript
// In sessions.ts hook/start handler, after creating/resuming session:
const budget = getWeeklyBudget(db, budgetThresholds);
const suggestion = budget.burnRate !== "low"
  ? generateRoutingSuggestion(budget, hook.task_description)
  : null;

return c.json({
  session,
  ...(suggestion && { budgetContext: suggestion }),
}, 201);
```

### Anti-Patterns to Avoid
- **Separate budget table:** CONTEXT.md explicitly says derive from sessions -- don't create a `session_budgets` or `budget_entries` table
- **Dollar amounts:** No cost estimates in v1.2. Session counts + burn rate only.
- **AI-powered routing:** Use keyword matching, not LLM calls. Instant, no cost, no latency.
- **Blocking LM Studio calls in request path:** Always read from module-level cache, never fetch LM Studio synchronously during a request.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Weekly date boundary calculation | Custom week math with edge cases | Simple `getWeekStart()` with configurable reset day | Just walk back days to target weekday -- straightforward |
| LM Studio API client | Full OpenAI-compatible client | Raw `fetch()` with 5s timeout | Only need GET /v1/models, not inference. One endpoint. |
| Burn rate calculation | Complex formula with weighting | Simple threshold comparison (count >= hot threshold) | Personal use, configurable thresholds are sufficient |
| Keyword matching for routing | NLP or regex engine | Simple `string.includes()` on lowercase task description | 15 keywords max, personal context, no false positive cost |

**Key insight:** This phase is deliberately simple. Two services, two routes, one config extension. The complexity lives in the integration points (hook response enrichment, health panel rendering) not in the algorithms.

## Common Pitfalls

### Pitfall 1: LM Studio Probe Timeout Blocks Event Loop
**What goes wrong:** `fetch()` to LM Studio hangs for 30+ seconds when Mac Mini is asleep or unreachable. Since the probe runs on setInterval, each stuck request accumulates.
**Why it happens:** Default fetch has no timeout. Mac Mini behind Tailscale may have intermittent connectivity.
**How to avoid:** Use `AbortController` with 5-second timeout on every probe. Catch errors silently. Cache the last known state.
**Warning signs:** Node.js event loop lag, API responses slow down.

### Pitfall 2: Sessions Table Timestamp Format Mismatch in Budget Query
**What goes wrong:** Budget query compares `startedAt` against a computed week start, but the comparison fails because of timestamp format differences. The sessions table uses `integer mode:timestamp` (epoch seconds via Drizzle), but the query might compare against milliseconds or ISO strings.
**Why it happens:** Drizzle's `integer mode:timestamp` stores epoch seconds (not milliseconds). JavaScript `Date.getTime()` returns milliseconds. Dividing by 1000 is easy to forget.
**How to avoid:** Use Drizzle's `sql` template with explicit epoch conversion: `sql\`${sessions.startedAt} >= ${Math.floor(weekStart.getTime() / 1000)}\``. Or use Drizzle's `gte()` operator which handles the conversion automatically when passed a Date.
**Warning signs:** Budget always shows zero sessions, or includes sessions from previous weeks.

### Pitfall 3: Hook Response Banner Noise
**What goes wrong:** Every session start gets a budget banner, even when budget is healthy. User ignores all banners due to fatigue.
**Why it happens:** Threshold set too low, or banner emitted unconditionally.
**How to avoid:** CONTEXT.md specifies: only fire when burn rate exceeds "moderate" threshold. When budget is "low", return session data only -- no budget context in the response.
**Warning signs:** Every Claude Code session start shows budget text.

### Pitfall 4: LM Studio Model ID String Matching
**What goes wrong:** The model ID in LM Studio's response doesn't exactly match "qwen3-coder-30b". It might be `qwen/qwen3-coder-30b-a3b-instruct-gguf` or a similar qualified path.
**Why it happens:** LM Studio model IDs include the publisher/repo path and quantization suffix. The exact format depends on how the model was downloaded.
**How to avoid:** Use partial matching: `model.id.toLowerCase().includes("qwen3-coder")` rather than exact equality. Log the actual model ID on first successful probe so the match pattern can be tuned.
**Warning signs:** Probe returns "loading" despite model being loaded and working.

### Pitfall 5: Hono RPC Type Chain Depth
**What goes wrong:** Adding two more `.route("/api", ...)` calls in app.ts pushes the TypeScript type chain deeper. `pnpm typecheck` may slow down or produce cryptic type errors.
**Why it happens:** Each `.route()` call nests the route types. With 15+ route groups, TypeScript inference struggles.
**How to avoid:** This is already flagged in STATE.md as a concern. Consider merging budget and models routes into the existing sessions route group (single `createSessionRoutes()` call). Alternatively, keep them separate but monitor typecheck performance. Run `pnpm typecheck` after adding routes to catch issues early.
**Warning signs:** `pnpm typecheck` takes > 30 seconds or produces "Type instantiation is excessively deep" errors.

## Code Examples

Verified patterns from the existing codebase:

### Budget Zod Schema (shared package)
```typescript
// packages/shared/src/schemas/budget.ts
import { z } from "zod";

export const burnRateEnum = z.enum(["low", "moderate", "hot"]);

export const weeklyBudgetSchema = z.object({
  weekStart: z.string(),
  opus: z.number().int().min(0),
  sonnet: z.number().int().min(0),
  local: z.number().int().min(0),
  unknown: z.number().int().min(0),
  burnRate: burnRateEnum,
  isEstimated: z.literal(true),
});

export const routingSuggestionSchema = z.object({
  suggestedTier: z.enum(["opus", "sonnet", "local"]).nullable(),
  reason: z.string(),
  localAvailable: z.boolean(),
}).nullable();

export const budgetResponseSchema = z.object({
  budget: weeklyBudgetSchema,
  suggestion: routingSuggestionSchema,
});
```

### LM Studio Status Zod Schema
```typescript
// packages/shared/src/schemas/models.ts (or extend session.ts)
import { z } from "zod";

export const lmStudioHealthEnum = z.enum(["unavailable", "loading", "ready"]);

export const lmStudioStatusSchema = z.object({
  health: lmStudioHealthEnum,
  modelId: z.string().nullable(),
  lastChecked: z.string().datetime(),
});

export const modelsResponseSchema = z.object({
  lmStudio: lmStudioStatusSchema,
});
```

### Config Extension for Budget Thresholds
```typescript
// Addition to mcConfigSchema in lib/config.ts
const budgetThresholdsSchema = z.object({
  weeklyOpusHot: z.number().int().min(1).default(20),
  weeklyOpusModerate: z.number().int().min(1).default(10),
  weekResetDay: z.number().int().min(0).max(6).default(5), // Friday
});

const lmStudioConfigSchema = z.object({
  url: z.string().url().default("http://100.123.8.125:1234"),
  targetModel: z.string().default("qwen3-coder"),
  probeIntervalMs: z.number().int().min(5000).default(30000),
});

// Add to mcConfigSchema:
// budget: budgetThresholdsSchema.default({}),
// lmStudio: lmStudioConfigSchema.default({}),
```

### Tier Routing Keyword Matching
```typescript
// In budget-service.ts
const TIER_KEYWORDS: Record<string, string[]> = {
  opus: ["architecture", "design", "complex", "plan", "refactor large", "security audit"],
  sonnet: ["test", "fix", "refactor", "update", "bug", "lint", "format"],
  local: ["scaffold", "boilerplate", "template", "generate", "stub"],
};

export function suggestTier(
  taskDescription: string | null,
  burnRate: BurnRate,
  localAvailable: boolean
): { suggestedTier: string | null; reason: string } | null {
  if (burnRate === "low") return null; // No suggestion when budget healthy

  const desc = (taskDescription ?? "").toLowerCase();

  // Check if task matches a specific tier
  for (const [tier, keywords] of Object.entries(TIER_KEYWORDS)) {
    if (keywords.some(kw => desc.includes(kw))) {
      // Don't suggest local if unavailable
      if (tier === "local" && !localAvailable) continue;
      // If burn rate is hot and task is opus-eligible, suggest downgrade
      if (burnRate === "hot" && tier === "opus") {
        return {
          suggestedTier: localAvailable ? "local" : "sonnet",
          reason: `Opus budget is hot. Consider ${localAvailable ? "local" : "sonnet"} for this task.`,
        };
      }
      return { suggestedTier: tier, reason: `Task matches ${tier} tier.` };
    }
  }

  // Default: if burn rate is hot, suggest downgrade
  if (burnRate === "hot") {
    return {
      suggestedTier: localAvailable ? "sonnet" : "sonnet",
      reason: `Week: ${burnRate} burn rate. Consider Sonnet for routine tasks.`,
    };
  }

  return null;
}
```

### Integration in index.ts (Timer Startup)
```typescript
// In index.ts, after session reaper:
import { startLmStudioProbe } from "./services/lm-studio.js";

let lmProbeTimer: ReturnType<typeof setInterval> | null = null;
const lmConfig = config?.lmStudio;
if (lmConfig) {
  lmProbeTimer = startLmStudioProbe(lmConfig.probeIntervalMs);
  console.log(`LM Studio probe started (${lmConfig.probeIntervalMs / 1000}s interval)`);
} else {
  // Default: always probe even without explicit config
  lmProbeTimer = startLmStudioProbe(30_000);
  console.log("LM Studio probe started (30s interval, default config)");
}

// In shutdown():
if (lmProbeTimer) {
  clearInterval(lmProbeTimer);
  lmProbeTimer = null;
  console.log("LM Studio probe stopped.");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate budget_entries table | Query sessions directly | CONTEXT.md decision | No new migration needed; simpler architecture |
| Dollar cost estimates | Session count + burn rate indicator | CONTEXT.md decision | Avoids misleading heuristics; honest data only |
| LM Studio v0 API (`/api/v0/models`) | LM Studio v1 API (`/v1/models`) | LM Studio 0.3+ | v1 is OpenAI-compatible; same endpoint Aider/other tools use |
| Polling from health-monitor.ts | Dedicated lm-studio.ts service | Phase 13 design | Health monitor does port checks; LM Studio needs HTTP + JSON parsing |

**LM Studio API Notes (verified):**
- `GET /v1/models` returns `{ object: "list", data: [{ id, object, type, state, ... }] }`
- `state` field values: `"loaded"` or `"not-loaded"` (confirmed from REST v0 docs; v1 follows same pattern)
- Empty `data` array when no models are available
- HTTP error (connection refused) when LM Studio is not running

## Open Questions

1. **LM Studio model ID exact format**
   - What we know: Model IDs include publisher path and quantization (e.g., `qwen/qwen3-coder-30b-a3b-instruct-gguf`)
   - What's unclear: The exact ID string for the locally installed Qwen3-Coder-30B
   - Recommendation: Use partial matching (`includes("qwen3-coder")`). Log actual model ID on first successful probe. Can be tightened later.

2. **Drizzle timestamp comparison semantics**
   - What we know: `sessions.startedAt` is `integer mode:timestamp` which stores epoch seconds
   - What's unclear: Whether Drizzle's `gte()` operator auto-converts JavaScript Date to epoch seconds, or if manual `Math.floor(date.getTime() / 1000)` is needed
   - Recommendation: Use raw `sql` template with explicit conversion to be safe. Test with a unit test.

3. **Hook response body visibility in Claude Code**
   - What we know: HTTP hooks receive a response, and CONTEXT.md says the SessionStart hook response carries budget data back
   - What's unclear: Whether Claude Code surfaces the HTTP hook response body to the user or logs it
   - Recommendation: Include budget context in the response JSON regardless. If CC doesn't surface it, it's still available for future MCP integration. The dashboard widget is the primary display.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^2.1.0 |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GATE-01 | LM Studio probe polls /v1/models and returns status | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/lm-studio.test.ts -x` | Wave 0 |
| GATE-02 | Three-state health derivation from API response | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/lm-studio.test.ts -x` | Wave 0 |
| GATE-03 | GET /api/models returns LM Studio status | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/models.test.ts -x` | Wave 0 |
| BUDG-02 | Weekly budget summary from sessions table | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/budget-service.test.ts -x` | Wave 0 |
| BUDG-03 | Tier routing suggestions based on burn rate + keywords | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/budget-service.test.ts -x` | Wave 0 |
| BUDG-04 | Budget responses include isEstimated flag, never restrict | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/budget-service.test.ts -x` | Wave 0 |
| API-05 | GET /api/budget returns weekly summary | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/budget.test.ts -x` | Wave 0 |
| API-06 | GET /api/models returns model availability | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/models.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/services/lm-studio.test.ts` -- covers GATE-01, GATE-02
- [ ] `packages/api/src/__tests__/services/budget-service.test.ts` -- covers BUDG-02, BUDG-03, BUDG-04
- [ ] `packages/api/src/__tests__/routes/models.test.ts` -- covers GATE-03, API-06
- [ ] `packages/api/src/__tests__/routes/budget.test.ts` -- covers API-05

**Testing approach for LM Studio probe:** Mock `fetch()` with Vitest's `vi.fn()` to simulate three states: connection refused (unavailable), empty model list (loading), model with `state: "loaded"` (ready). Do NOT test against the real LM Studio endpoint.

**Testing approach for budget service:** Insert test session rows into in-memory SQLite via `createTestDb()`, then verify aggregation counts and burn rate classification. Test week boundary logic with explicit dates.

## Sources

### Primary (HIGH confidence)
- Existing MC codebase: `services/health-monitor.ts`, `routes/health.ts`, `routes/sessions.ts`, `db/schema.ts`, `services/session-service.ts`, `lib/config.ts`, `services/event-bus.ts` -- patterns verified by reading source
- `packages/api/src/app.ts` -- route registration pattern, Hono RPC type chain
- `packages/api/src/index.ts` -- timer startup pattern, shutdown cleanup
- `packages/shared/src/schemas/session.ts` -- existing session/tier schemas
- CONTEXT.md -- locked decisions on budget display, routing, LM Studio probing

### Secondary (MEDIUM confidence)
- [LM Studio REST API v0 Endpoints](https://lmstudio.ai/docs/developer/rest/endpoints) -- `/v1/models` response format with `state` field confirmed (`"loaded"` / `"not-loaded"`)
- [LM Studio OpenAI Compatibility Docs](https://lmstudio.ai/docs/developer/openai-compat) -- v1 API endpoint compatibility
- [LM Studio API Overview](https://lmstudio.ai/docs/developer/rest) -- General API structure

### Tertiary (LOW confidence)
- Exact model ID string for locally installed Qwen3-Coder-30B -- needs runtime verification
- Claude Code HTTP hook response body visibility to user -- needs testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing patterns
- Architecture: HIGH -- two services, two routes, one config extension; follows established patterns exactly
- Pitfalls: HIGH -- timestamp format, model ID matching, and hook response noise are well-understood; mitigations straightforward
- LM Studio API: MEDIUM -- response format verified via docs but exact model ID needs runtime check

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable -- LM Studio API unlikely to change within 30 days)
