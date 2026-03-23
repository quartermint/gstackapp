# Phase 37: Proactive Intelligence - Research

**Researched:** 2026-03-23
**Domain:** Dashboard intelligence UX, insight generation, pattern detection, proactive surfacing
**Confidence:** HIGH

## Summary

Phase 37 wires the Intelligence Daemon (Phase 35) into the dashboard UX so MC stops being pull-only. The backend infrastructure is largely complete -- daily digest generation, intelligence cache with TTL, event bus with `intelligence:*` events, and LM Studio constrained generation are all shipped. The primary work is: (1) evolving the What's New strip into an intelligence strip that shows morning digest content, (2) building an insights system with new DB table + API routes for proactive surfacing of stale captures, activity patterns, session patterns, and cross-project patterns, and (3) adding dismiss/snooze persistence so insights don't cause fatigue.

The existing codebase provides strong patterns to follow: the health findings card pattern for insight cards, the `seenSlugs` state pattern for dismiss tracking, the `fetchCounter` convention for data fetching, and the intelligence cache for storing generated content. No new dependencies are needed. The digest generator already produces the morning digest content; this phase needs to surface it through the intelligence strip and add the insights generation pipeline alongside it.

**Primary recommendation:** Build an `insights` table for persistent insight storage with dismiss/snooze state, add 3 new API endpoints (`GET /intelligence/insights`, `POST /intelligence/insights/:id/dismiss`, `POST /intelligence/insights/:id/snooze`), extend the daemon with insight generation (activity patterns, session patterns, cross-project patterns), and evolve the WhatsNewStrip into an IntelligenceStrip that conditionally shows digest or standard What's New content.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The What's New top strip evolves into an "intelligence strip." Morning view shows AI-generated digest; after reading (click or scroll past), fades to regular What's New content. Same real estate, smarter content.
- **D-02:** Digest generated overnight by DAEMON-04 (Phase 35). Dashboard pulls from intelligence cache on load.
- **D-03:** Digest content prioritized by actionability: stale captures first, then dependency drift, then activity summary.
- **D-04:** Captures older than 7d without project assignment → surface for triage with suggested actions (assign, archive, dismiss).
- **D-05:** "You captured 5 openefb ideas this week but haven't committed in 12 days" — gap detection between capture intent and execution.
- **D-06:** Session pattern insights: "Your most productive sessions start after 10am and last 45min."
- **D-07:** Surface shared patterns across projects: "cocobanana and openefb both reference MapLibre — shared pattern?"
- **D-08:** Insights can be dismissed or snoozed. Dismissed insights don't resurface. Prevents insight fatigue.

### Claude's Discretion
- Insight card design and visual treatment
- Pattern detection algorithms and thresholds
- How insights transition from intelligence strip to dismissal
- Whether insights group or display individually
- Stale capture triage UX layout (inline vs modal vs sidebar)

### Deferred Ideas (OUT OF SCOPE)
- Push notifications for critical insights (MC is pull-only by design)
- Weekly retrospective generation (currently via /retro gstack skill)
- Predictive insights ("based on your capture pattern, you'll likely context-switch to openefb this week")
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROACT-01 | Morning digest -- AI-generated "what happened since you last looked" | Digest generator already exists (Phase 35). Needs intelligence strip UX to surface it. Pull from `/api/intelligence/digest` via existing `useDigest` hook. |
| PROACT-02 | Stale capture triage -- surface uncategorized/unacted captures for review | Existing `getStaleCaptures` query (14d threshold) needs adjustment to 7d per D-04. Existing TriageView modal can be reused. New: proactive surfacing as insight cards. |
| PROACT-03 | Activity pattern detection -- capture-vs-commit gap | New: query captures grouped by project for last 7d, cross-reference with commits. Pure SQL aggregation + rule-based pattern detection. |
| PROACT-04 | Session pattern insights -- productive time analysis | New: query completed sessions, compute start-time distribution and duration stats. Rule-based pattern detection (no LLM needed). |
| PROACT-05 | Cross-project insight surfacing -- shared patterns | New: use hybrid search or FTS5 to find overlapping terms across project captures/knowledge. LM Studio can summarize shared patterns. |
| PROACT-06 | Insight dismissal -- dismiss/snooze to prevent fatigue | New: `insights` table with `dismissed_at`/`snoozed_until` columns. Dismissed insights filtered at query time. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | 4.7.5 | API routes for insights | Already in use, typed routes |
| Drizzle ORM | 0.38.4 | DB queries for insights table | Already in use, type-safe |
| better-sqlite3 | 11.8.1 | SQLite backend | Already in use |
| Zod | 3.24.2 | Schema validation for insight types | Already in use for all API boundaries |
| ai (Vercel AI SDK) | 4.3.16 | LM Studio generation for cross-project insights | Already in use for narratives/digest |
| node-cron | 3.0.3 | Scheduled insight generation | Already in use for digest |
| React | 19.0.0 | Dashboard components | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nanoid | 5.1.5 | ID generation for insights | Already used for all table IDs |

### Alternatives Considered
None -- this phase uses the existing stack exclusively. No new dependencies needed.

## Architecture Patterns

### Recommended Structure
```
packages/api/src/
├── db/
│   ├── schema.ts                          # Add insights table
│   └── queries/
│       └── insights.ts                    # CRUD for insights
├── services/
│   ├── insight-generator.ts               # Pattern detection + insight creation
│   └── intelligence-daemon.ts             # Extend with insight generation schedule
├── routes/
│   └── intelligence.ts                    # Extend with insight endpoints
└── __tests__/
    ├── db/queries/insights.test.ts
    ├── services/insight-generator.test.ts
    └── routes/intelligence-insights.test.ts

packages/web/src/
├── hooks/
│   └── use-insights.ts                    # Fetch + dismiss/snooze
├── components/
│   ├── whats-new/
│   │   └── whats-new-strip.tsx            # Evolve into IntelligenceStrip
│   └── insights/
│       ├── insight-card.tsx               # Individual insight display
│       └── insight-strip.tsx              # Intelligence strip container
└── __tests__/
    └── hooks/use-insights.test.ts
```

### Pattern 1: Insights Table Schema
**What:** New `insights` table for persistent insight storage with lifecycle management.
**When to use:** All proactive insights (stale captures, activity patterns, session patterns, cross-project).
**Example:**
```typescript
// Follows existing schema patterns (nanoid PK, integer timestamps, text enums)
export const insights = sqliteTable(
  "insights",
  {
    id: text("id").primaryKey(),
    type: text("type", {
      enum: ["stale_capture", "activity_gap", "session_pattern", "cross_project"],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // Structured metadata as JSON (same pattern as session.filesJson)
    metadata: text("metadata"),
    // Which project(s) this insight relates to
    projectSlug: text("project_slug"),
    // Content hash to detect duplicate insights
    contentHash: text("content_hash").notNull(),
    // Lifecycle
    dismissedAt: integer("dismissed_at", { mode: "timestamp" }),
    snoozedUntil: integer("snoozed_until", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("insights_type_idx").on(table.type),
    index("insights_dismissed_idx").on(table.dismissedAt),
    index("insights_project_slug_idx").on(table.projectSlug),
    uniqueIndex("insights_content_hash_uniq").on(table.contentHash),
  ]
);
```

### Pattern 2: Content-Hash Dedup for Insights
**What:** SHA-256 content hash on insights to prevent duplicate surfacing.
**When to use:** Every insight generation cycle.
**Why:** The daemon runs on a schedule. Without dedup, "you captured 5 openefb ideas this week but haven't committed in 12 days" would appear every 30 minutes. The content hash (computed from type + core parameters) ensures each unique insight is created once.
**Example:**
```typescript
// Same computeContentHash from embedding.ts (reuse existing utility)
import { computeContentHash } from "./embedding.js";

function insightHash(type: string, key: string): string {
  return computeContentHash(`${type}:${key}`);
}
```

### Pattern 3: Intelligence Strip Evolution
**What:** The WhatsNewStrip component conditionally renders digest content in the morning, then fades to standard What's New when dismissed/read.
**When to use:** Dashboard load.
**Why D-01:** Same real estate, smarter content. Morning view shows digest; after reading, shows discoveries/stars/changed.
**Example:**
```typescript
// State-driven: digest visible until user interacts
function IntelligenceStrip({ digest, insights, discoveries, stars, ... }) {
  const [digestRead, setDigestRead] = useState(false);

  // Morning: show digest
  if (digest && !digestRead) {
    return <DigestStripView digest={digest} onRead={() => setDigestRead(true)} />;
  }

  // After reading or no digest: show insights + standard What's New
  return (
    <div>
      {insights.length > 0 && <InsightBadges insights={insights} />}
      <WhatsNewContent discoveries={discoveries} stars={stars} />
    </div>
  );
}
```

### Pattern 4: Rule-Based Pattern Detection (No LLM for PROACT-03/04)
**What:** Activity gap and session pattern detection use pure SQL aggregation + threshold rules, not LLM generation.
**When to use:** PROACT-03 (capture-vs-commit gap) and PROACT-04 (productive time analysis).
**Why:** These patterns are computable from data -- no natural language generation needed. LLM calls are expensive and slow. Rules are deterministic, testable, and fast.
**Example:**
```typescript
// PROACT-03: Activity gap detection
function detectActivityGaps(db: DrizzleDb): ActivityGapInsight[] {
  // Captures in last 7d by project
  const capturesByProject = db.select({
    projectId: captures.projectId,
    count: sql<number>`count(*)`,
  })
    .from(captures)
    .where(sql`${captures.createdAt} >= ${sevenDaysAgoEpoch}`)
    .groupBy(captures.projectId)
    .all();

  // Most recent commit per project
  const latestCommits = db.select({
    projectSlug: commits.projectSlug,
    latestDate: sql<string>`max(${commits.authorDate})`,
  })
    .from(commits)
    .groupBy(commits.projectSlug)
    .all();

  // Cross-reference: captures exist but no recent commits
  // Threshold: >=3 captures in 7d + no commits in 7d
  // ...
}
```

### Pattern 5: Insight Dismissal with seenSlugs-like State
**What:** Dismiss and snooze actions follow the existing `seenSlugs` pattern -- optimistic local state + API persistence.
**When to use:** PROACT-06.
**Example:**
```typescript
// Frontend: optimistic dismiss
const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

async function handleDismiss(id: string) {
  setDismissedIds(prev => new Set([...prev, id])); // Optimistic
  await fetch(`/api/intelligence/insights/${id}/dismiss`, { method: "POST" });
}

// Filter dismissed from display
const activeInsights = insights.filter(i => !dismissedIds.has(i.id));
```

### Anti-Patterns to Avoid
- **LLM for everything:** PROACT-03 and PROACT-04 are pure data analysis. Using LLM for "you captured 5 ideas" is wasteful -- use SQL aggregation.
- **Generating insights on API request:** Insight generation must be scheduled (daemon), never triggered by dashboard load. Cache-first serving only.
- **Separate digest panel + intelligence strip:** D-01 says "same real estate" -- evolve the strip, don't add another panel. The existing `DailyDigestPanel` below the compound score should be refactored into the intelligence strip.
- **Hard-coded thresholds without config:** Pattern detection thresholds (7d stale, 3+ captures for gap, 12d no commits) should be constants at file top, not magic numbers inline.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Content-addressable dedup | Custom hash comparison | `computeContentHash` from `embedding.ts` + unique index | Already proven in Phases 24, 32, 33 |
| Insight caching | Custom cache layer | `intelligence-cache.ts` with `writeToCache`/`getFromCache` | Already handles TTL, locks, purging |
| Scheduled generation | Custom timers | Extend `intelligence-daemon.ts` with new interval | Already orchestrates narratives, digest, cleanup |
| SSE events | Custom event dispatch | `eventBus.emit("mc:event", ...)` with new event types | Already handles all MC events |
| Insight card UI | Custom card design | Reuse FindingRow/FindingsPanel pattern from health findings | Severity, metadata, dismiss action already built |
| Stale capture surfacing | New stale detection | Adjust `getStaleCaptures` threshold (14d -> 7d per D-04) | Existing query, just parameterize |

**Key insight:** Phase 37 is primarily a UX wiring phase, not an infrastructure phase. 80% of the backend exists. The work is: new table, new queries, pattern detection logic, and dashboard component evolution.

## Common Pitfalls

### Pitfall 1: Insight Spam from Daemon Cycles
**What goes wrong:** Every daemon cycle generates the same insights, flooding the insights table.
**Why it happens:** Pattern detection runs every N minutes and finds the same gaps.
**How to avoid:** Content-hash uniqueIndex on the insights table. Before inserting, compute hash from (type + core params). ON CONFLICT DO NOTHING. Only new, unique insights get created.
**Warning signs:** Insights table growing linearly with daemon uptime.

### Pitfall 2: Stale Capture Threshold Mismatch
**What goes wrong:** D-04 says 7 days, but existing `getStaleCaptures` uses 14 days. Two different definitions of "stale" cause confusion.
**Why it happens:** Phase 37 has a different threshold than the original triage feature.
**How to avoid:** Parameterize `getStaleCaptures` with a `daysThreshold` parameter. PROACT-02 insight generation passes 7, TriageView continues to use 14 (or is updated to 7 for consistency per D-04).
**Warning signs:** Insights say "X captures need triage" but TriageView shows different count.

### Pitfall 3: Intelligence Strip Z-Index Conflicts
**What goes wrong:** The WhatsNewStrip already has `relative z-30` in App.tsx. Adding digest content with popovers/overlays can clash with existing discovery/star popovers.
**Why it happens:** Multiple z-indexed overlay elements in the same strip.
**How to avoid:** Keep the same z-30 for the strip container. Digest content should not use popovers -- it's inline content that fades. Insight badges can reuse the existing popover pattern.
**Warning signs:** Popovers clipped or rendered behind other elements.

### Pitfall 4: Cross-Project Insight Generation Overload
**What goes wrong:** PROACT-05 cross-project insights use LM Studio to summarize shared patterns. If run for all project pairs (N*(N-1)/2), this overwhelms LM Studio.
**Why it happens:** Naive implementation checks every pair.
**How to avoid:** Pre-filter with FTS5 or keyword overlap before sending to LLM. Only generate LLM summaries for pairs that share >= 3 overlapping terms in recent captures/knowledge. Sequential generation with lock (same as narrative pattern).
**Warning signs:** LM Studio queue backed up, generation timeouts.

### Pitfall 5: Digest-in-Strip vs. Digest Panel Duplication
**What goes wrong:** D-01 says digest goes in the intelligence strip, but the existing `DailyDigestPanel` is rendered separately in App.tsx (line 316-319). Both show digest.
**Why it happens:** Forgetting to remove/refactor the standalone digest panel.
**How to avoid:** The intelligence strip replaces both the WhatsNewStrip and the DailyDigestPanel. The standalone panel should be removed or absorbed into the strip. Single source of digest display.
**Warning signs:** Same digest content visible in two places on the dashboard.

### Pitfall 6: Session Pattern Detection with Sparse Data
**What goes wrong:** PROACT-04 generates nonsensical insights ("Your most productive sessions start after 3am") from sparse session data.
**Why it happens:** Insufficient sample size. With only 5 sessions, patterns are noise.
**How to avoid:** Minimum sample size gate: require >= 10 completed sessions before generating session pattern insights. Include this threshold as a constant.
**Warning signs:** Pattern insights generated on day 1 of MC usage.

## Code Examples

### Stale Capture Insight Generation (PROACT-02)
```typescript
// Source: existing getStaleCaptures pattern + D-04 threshold
function generateStaleCaptureInsights(db: DrizzleDb): void {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const sevenDaysAgoEpoch = Math.floor(sevenDaysAgo.getTime() / 1000);

  // Captures older than 7d without project assignment
  const staleUnassigned = db
    .select({ count: sql<number>`count(*)` })
    .from(captures)
    .where(
      sql`${captures.createdAt} < ${sevenDaysAgoEpoch}
          AND ${captures.projectId} IS NULL
          AND ${captures.status} != 'archived'`
    )
    .get();

  const count = staleUnassigned?.count ?? 0;
  if (count === 0) return;

  const hash = computeContentHash(`stale_capture:${count}:${new Date().toISOString().slice(0, 10)}`);

  // Insert with ON CONFLICT DO NOTHING (dedup by content hash)
  db.insert(insights).values({
    id: nanoid(),
    type: "stale_capture",
    title: `${count} captures need triage`,
    body: `You have ${count} capture${count > 1 ? "s" : ""} older than 7 days without a project assignment. Review and assign, archive, or dismiss them.`,
    contentHash: hash,
    createdAt: new Date(),
  }).onConflictDoNothing().run();
}
```

### Activity Gap Detection (PROACT-03)
```typescript
// Source: D-05 gap detection pattern
function detectActivityGaps(db: DrizzleDb): void {
  const sevenDaysAgoEpoch = Math.floor((Date.now() - 7 * 24 * 60 * 60_000) / 1000);
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();

  // Captures by project in last 7 days
  const capturesByProject = db
    .select({
      projectId: captures.projectId,
      captureCount: sql<number>`count(*)`,
    })
    .from(captures)
    .where(sql`${captures.createdAt} >= ${sevenDaysAgoEpoch} AND ${captures.projectId} IS NOT NULL`)
    .groupBy(captures.projectId)
    .all();

  for (const { projectId, captureCount } of capturesByProject) {
    if (!projectId || captureCount < 3) continue; // Minimum signal

    // Latest commit for this project
    const latest = db
      .select({ authorDate: commits.authorDate })
      .from(commits)
      .where(sql`${commits.projectSlug} = ${projectId}`)
      .orderBy(sql`${commits.authorDate} DESC`)
      .limit(1)
      .get();

    if (!latest) continue;

    const daysSinceCommit = Math.floor(
      (Date.now() - new Date(latest.authorDate).getTime()) / (24 * 60 * 60_000)
    );

    if (daysSinceCommit < 7) continue; // Recent commits -- no gap

    const hash = computeContentHash(
      `activity_gap:${projectId}:${captureCount}:${daysSinceCommit}:${new Date().toISOString().slice(0, 10)}`
    );

    db.insert(insights).values({
      id: nanoid(),
      type: "activity_gap",
      title: `${projectId}: ${captureCount} ideas, ${daysSinceCommit}d since last commit`,
      body: `You captured ${captureCount} ${projectId} ideas this week but haven't committed in ${daysSinceCommit} days.`,
      projectSlug: projectId,
      contentHash: hash,
      createdAt: new Date(),
    }).onConflictDoNothing().run();
  }
}
```

### Session Pattern Detection (PROACT-04)
```typescript
// Source: D-06 session pattern analysis
const MIN_SESSIONS_FOR_PATTERN = 10;

function detectSessionPatterns(db: DrizzleDb): void {
  const completed = db
    .select({
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      tier: sessions.tier,
      projectSlug: sessions.projectSlug,
    })
    .from(sessions)
    .where(sql`${sessions.status} = 'completed' AND ${sessions.endedAt} IS NOT NULL`)
    .orderBy(sql`${sessions.startedAt} DESC`)
    .limit(50)
    .all();

  if (completed.length < MIN_SESSIONS_FOR_PATTERN) return;

  // Compute start hour distribution
  const hourCounts = new Map<number, { count: number; totalDuration: number }>();
  for (const s of completed) {
    const hour = s.startedAt.getHours();
    const duration = s.endedAt
      ? (s.endedAt.getTime() - s.startedAt.getTime()) / 60_000
      : 0;
    const existing = hourCounts.get(hour) ?? { count: 0, totalDuration: 0 };
    hourCounts.set(hour, {
      count: existing.count + 1,
      totalDuration: existing.totalDuration + duration,
    });
  }

  // Find peak hour and average duration
  let peakHour = 0;
  let maxCount = 0;
  for (const [hour, data] of hourCounts) {
    if (data.count > maxCount) {
      peakHour = hour;
      maxCount = data.count;
    }
  }

  const peakData = hourCounts.get(peakHour)!;
  const avgDuration = Math.round(peakData.totalDuration / peakData.count);

  const hash = computeContentHash(
    `session_pattern:${peakHour}:${avgDuration}:${new Date().toISOString().slice(0, 10)}`
  );

  const hourStr = peakHour === 0 ? "12am" : peakHour < 12 ? `${peakHour}am` : peakHour === 12 ? "12pm" : `${peakHour - 12}pm`;

  db.insert(insights).values({
    id: nanoid(),
    type: "session_pattern",
    title: `Most productive sessions start after ${hourStr}`,
    body: `Your most productive sessions start after ${hourStr} and last ${avgDuration}min (based on ${completed.length} sessions).`,
    contentHash: hash,
    createdAt: new Date(),
  }).onConflictDoNothing().run();
}
```

### Intelligence Strip Component (D-01)
```typescript
// Source: WhatsNewStrip evolution per D-01
interface IntelligenceStripProps {
  digest: DailyDigest | null;
  digestLoading: boolean;
  insights: Insight[];
  discoveries: DiscoveryItem[];
  stars: StarItem[];
  onDigestRead: () => void;
  onInsightDismiss: (id: string) => void;
  onInsightSnooze: (id: string) => void;
  onPromote: (id: string) => void;
  onDismiss: (id: string) => void;
  onUpdateStarIntent: (githubId: number, intent: string) => void;
  changedCount?: number;
}
```

### Insight API Endpoints
```typescript
// Source: existing intelligence.ts route pattern
// Extend createIntelligenceRoutes with insight endpoints

.get("/intelligence/insights", (c) => {
  const db = getInstance().db;
  const active = getActiveInsights(db); // Filters dismissed + snoozed
  return c.json({ insights: active });
})

.post("/intelligence/insights/:id/dismiss", (c) => {
  const db = getInstance().db;
  const id = c.req.param("id");
  dismissInsight(db, id);
  return c.json({ ok: true });
})

.post("/intelligence/insights/:id/snooze", async (c) => {
  const db = getInstance().db;
  const id = c.req.param("id");
  const body = await c.req.json();
  const hours = body.hours ?? 24; // Default: snooze 24h
  snoozeInsight(db, id, hours);
  return c.json({ ok: true });
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DailyDigestPanel as separate component below compound score | Intelligence strip absorbs digest into What's New real estate (D-01) | Phase 37 | Digest becomes morning-first content in the strip, not a standalone panel |
| getStaleCaptures with 14d threshold | Parameterized threshold, PROACT-02 uses 7d (D-04) | Phase 37 | More aggressive surfacing of unassigned captures |
| What's New strip shows only discoveries/stars/changed | Intelligence strip shows digest + insights + discoveries/stars/changed | Phase 37 | Single smart strip replaces two panels |

## Open Questions

1. **Stale capture threshold alignment**
   - What we know: D-04 says 7 days. Existing `getStaleCaptures` uses 14 days. TriageView uses 14 days.
   - What's unclear: Should TriageView also switch to 7 days for consistency, or keep 14 days as a separate "deep stale" concept?
   - Recommendation: Update both to 7 days for consistency. The insight surfaces awareness; the triage modal handles resolution. Same threshold avoids confusion.

2. **Cross-project insight generation scope (PROACT-05)**
   - What we know: D-07 wants shared pattern detection with cited evidence. FTS5 and hybrid search exist.
   - What's unclear: How computationally expensive is cross-project term overlap detection for 35+ projects?
   - Recommendation: Pre-filter with FTS5 term frequency overlap (cheap SQL). Only send top 3-5 most overlapping pairs to LLM for narrative summary. Cap LLM calls per generation cycle.

3. **Digest-in-strip vs. digest panel migration**
   - What we know: D-01 says "same real estate" for the intelligence strip. The DailyDigestPanel currently exists as a separate component below compound score.
   - What's unclear: Should the DailyDigestPanel be fully removed, or retained as a fallback when no insights exist?
   - Recommendation: Remove the standalone DailyDigestPanel. The intelligence strip is the single display surface. When no digest and no insights, the strip falls back to standard What's New behavior.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROACT-01 | Digest served from intelligence strip via existing endpoint | integration | `pnpm --filter @mission-control/api exec vitest run src/__tests__/routes/intelligence.test.ts -x` | Exists (extend) |
| PROACT-02 | Stale capture insights generated with 7d threshold | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/insight-generator.test.ts -x` | Wave 0 |
| PROACT-03 | Activity gap detection generates insights | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/insight-generator.test.ts -x` | Wave 0 |
| PROACT-04 | Session pattern detection generates insights | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/insight-generator.test.ts -x` | Wave 0 |
| PROACT-05 | Cross-project shared pattern insights | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/insight-generator.test.ts -x` | Wave 0 |
| PROACT-06 | Dismiss/snooze persisted and filtered | unit + integration | `pnpm --filter @mission-control/api exec vitest run src/__tests__/db/queries/insights.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/db/queries/insights.test.ts` -- covers PROACT-06 (CRUD + dedup + dismiss/snooze filtering)
- [ ] `packages/api/src/__tests__/services/insight-generator.test.ts` -- covers PROACT-02/03/04/05 (pattern detection logic)
- [ ] `packages/api/src/__tests__/routes/intelligence-insights.test.ts` -- covers API endpoints (GET/POST insights)

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode** -- no `any` types, use `unknown`
- **Zod schemas** for all API boundaries
- **Naming:** files `kebab-case.ts`, types `PascalCase`, functions `camelCase`, constants `SCREAMING_SNAKE_CASE`
- **Typed errors:** `AppError` class with `code` and `status`
- **Conventional commits:** `feat(scope):`, `fix(scope):`, etc.
- **Module system:** ESM throughout
- **fetchCounter pattern** for React data fetching (NOT TanStack Query)
- **SSE for real-time** via `eventBus.emit("mc:event", ...)`
- **Persist first, enrich later** -- insights generated async by daemon, served from DB/cache
- **API-first** -- all intelligence served via API endpoints

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis: `intelligence-daemon.ts`, `intelligence-cache.ts`, `digest-generator.ts`, `narrative-generator.ts`, `routing-advisor.ts`, `intelligence-tools.ts`
- Existing codebase analysis: `event-bus.ts` (event types), `schema.ts` (table patterns), `captures.ts` (stale query)
- Existing codebase analysis: `whats-new-strip.tsx`, `daily-digest.tsx`, `triage-view.tsx`, `findings-panel.tsx`, `App.tsx` (layout)
- Phase 35 CONTEXT.md decisions (DAEMON-04 through DAEMON-08)
- Phase 37 CONTEXT.md decisions (D-01 through D-08)

### Secondary (MEDIUM confidence)
- v2.0-VISION.md PROACT-01 through PROACT-06 requirement definitions

### Tertiary (LOW confidence)
- Pattern detection thresholds (3+ captures, 7d+ no commits, 10+ sessions minimum) -- reasonable defaults but may need tuning after real usage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing libraries
- Architecture: HIGH -- follows established patterns (cache-first, daemon-generated, SSE events, fetchCounter hooks)
- Pitfalls: HIGH -- identified from direct codebase analysis (threshold mismatch, dedup, z-index, LLM overload)
- Pattern detection algorithms: MEDIUM -- thresholds are reasonable estimates that may need tuning

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable -- internal project, no external dependency changes)
