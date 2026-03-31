# Phase 6: Onboarding & Quality Trends - Research

**Researched:** 2026-03-30
**Domain:** Onboarding wizard UX, quality scoring algorithms, Recharts trend visualization
**Confidence:** HIGH

## Summary

Phase 6 is two distinct feature groups that share a common dependency on accumulated pipeline data: (1) a guided onboarding wizard that helps first-time users go from zero to their first real review, and (2) quality trend visualizations that show how repo code quality changes over time. The onboarding wizard is primarily frontend work with one new API endpoint (onboarding status check), while quality trends require both new API aggregation endpoints and new Recharts chart components in the dashboard.

The existing codebase provides strong foundations. The repos API (`GET /repos`) already returns connected repos, the pipeline data model stores all the fields needed for scoring (findings with severity tiers, stage verdicts, timestamps), and the frontend has established patterns for TanStack Query hooks, Tailwind styling with DESIGN.md tokens, SSE-based real-time updates, and component organization. Recharts ^2.15.4 is already in `packages/web/package.json` (though not yet installed in node_modules). The GitHub App installation handler already persists repos on `installation.created` webhook.

**Primary recommendation:** Split into three plans: (1) API endpoints for onboarding status and trend aggregation, (2) onboarding wizard UI, (3) trend chart components. The quality score calculation should be a pure function in `packages/shared` so it can be unit tested independently and reused in both API responses and future contexts.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** In-app guided wizard surfaces when no repos are connected (detected on dashboard load)
- **D-02:** Flow: Install GitHub App -> Select repositories -> Open a PR or trigger first review on existing PR
- **D-03:** First review experience shows pipeline running in real-time with actual PR data (not dummy data)
- **D-04:** Wizard includes user preference capture: failure handling preference (retry+FLAG default, retry+SKIP, fail-fast)
- **D-05:** Weighted scoring algorithm -- findings weighted by severity tier: Tier 1 (critical) = 3x weight, Tier 2 (notable) = 1x weight, Tier 3 (minor) = 0 weight
- **D-06:** Quality score = 100 - (weighted_finding_sum / normalization_factor). Higher = cleaner code.
- **D-07:** Scores calculated per-repo and per-stage
- **D-08:** Recharts line/area charts for quality score over time (per-repo)
- **D-09:** Per-stage pass/flag/block rates as stacked area charts
- **D-10:** Finding frequency trends showing how patterns change over time
- **D-11:** Charts follow DESIGN.md color system -- stage spectral colors for per-stage views

### Claude's Discretion
- Exact normalization factor for quality score calculation
- Time granularity for trend charts (daily? weekly? auto-adapt to data volume?)
- Onboarding wizard step count and transitions
- How to handle repos with <5 pipeline runs (insufficient data for trends)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ONBD-01 | In-app guided setup wizard: install GitHub App -> select repos -> trigger first review | Wizard component architecture, GitHub App install URL pattern, repos API for detection |
| ONBD-02 | Onboarding detects when no repos are connected and surfaces the wizard | GET /api/repos returns empty array -> show wizard; new onboarding status endpoint |
| ONBD-03 | First review experience shows pipeline in action with real PR data | Existing SSE + PipelineHero component handles this already; wizard needs to route there |
| TRND-01 | Quality scores tracked per repo over time | Quality score algorithm (D-05/D-06), new aggregation API endpoint, Recharts LineChart |
| TRND-02 | Per-stage pass/flag/block rates visualized as trend charts | SQL GROUP BY stage + verdict, Recharts StackedAreaChart with stage spectral colors |
| TRND-03 | Finding frequency trends visible on dashboard | SQL GROUP BY category/severity over time, Recharts AreaChart or BarChart |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Recharts | ^2.15.4 | Trend charts | Already in package.json. Declarative React charts. AreaChart + LineChart + stacked variants cover all D-08/D-09/D-10 requirements. |
| @tanstack/react-query | ^5.95.2 | Data fetching for trend endpoints | Existing pattern. Caching + background refetching for dashboard data. |
| date-fns | ^4.1.0 | Date bucketing for trends | Already installed. format(), startOfDay(), startOfWeek() for time granularity. |
| Drizzle ORM | ^0.45 | SQL aggregation queries | Existing. count(), sql\`\`, groupBy() for trend data aggregation. |
| Zod | ^3.24 | Schema validation for trend API responses | Existing. Shared schemas for type safety. |

### Supporting (no new dependencies needed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clsx + tailwind-merge | ^2.1 / ^3.5 | Conditional styling | Wizard step transitions, chart container styling |
| Hono | ^4.12 | New API routes | Trend aggregation endpoints, onboarding status endpoint |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts 2.x | Recharts 3.x (3.8.1 now on npm) | 3.x has breaking API changes. Project pinned ^2.15 in decided stack. Stick with 2.x for Phase 1 stability. |
| Recharts | Nivo / Victory / Tremor | All viable but Recharts is in the decided stack, already in package.json. No reason to switch. |
| SQL aggregation in Drizzle | Materialized view / pre-computed table | Premature optimization. At single-user scale (<1000 pipeline runs), real-time SQL aggregation is sub-millisecond on SQLite. |

**Installation:**
```bash
# Recharts already in package.json -- just ensure npm install runs
cd packages/web && npm install
```

**Version verification:** Recharts 2.15.4 is the latest 2.x release (verified via `npm view recharts@2 version`). date-fns 4.1.0 is latest (verified via `npm view date-fns version`).

## Architecture Patterns

### New Files Structure
```
packages/
├── api/src/
│   ├── routes/
│   │   ├── trends.ts              # New: GET /api/trends/scores, /api/trends/verdicts, /api/trends/findings
│   │   └── onboarding.ts          # New: GET /api/onboarding/status
│   └── lib/
│       └── scoring.ts             # New: quality score calculation logic
├── shared/src/
│   └── schemas/
│       └── trends.ts              # New: Zod schemas for trend API responses
├── web/src/
│   ├── components/
│   │   ├── onboarding/
│   │   │   ├── OnboardingWizard.tsx    # Wizard container with step management
│   │   │   ├── StepInstallApp.tsx      # Step 1: Install GitHub App
│   │   │   ├── StepSelectRepos.tsx     # Step 2: Wait for repos
│   │   │   └── StepFirstReview.tsx     # Step 3: Trigger/watch first review
│   │   └── trends/
│   │       ├── QualityScoreChart.tsx   # Line chart: quality score over time
│   │       ├── VerdictRateChart.tsx    # Stacked area: pass/flag/block per stage
│   │       └── FindingTrendChart.tsx   # Area chart: finding frequency over time
│   ├── hooks/
│   │   ├── useOnboardingStatus.ts     # New: check if onboarding needed
│   │   └── useTrends.ts              # New: fetch trend data
│   └── api/
│       └── client.ts                  # Extended: add queryKeys for trends + onboarding
```

### Pattern 1: Quality Score Calculation (Pure Function)
**What:** Quality score as a deterministic, testable pure function
**When to use:** Called by the trends API to compute scores for each pipeline run
**Recommendation for normalization factor:** Use `normalization_factor = max(10, total_findings_count)` so the score degrades gracefully. With 0 findings, score = 100. With 1 critical finding, score = 100 - (3/10) * 100 = 70. With 10 critical findings, score = 100 - (30/30) * 100 = 0. Cap at 0 minimum.

```typescript
// packages/api/src/lib/scoring.ts
interface ScoringInput {
  critical: number  // count of critical findings
  notable: number   // count of notable findings
  minor: number     // count of minor findings (0 weight per D-05)
}

const SEVERITY_WEIGHTS = {
  critical: 3,
  notable: 1,
  minor: 0,
} as const

export function calculateQualityScore(input: ScoringInput): number {
  const weightedSum =
    input.critical * SEVERITY_WEIGHTS.critical +
    input.notable * SEVERITY_WEIGHTS.notable +
    input.minor * SEVERITY_WEIGHTS.minor

  // Normalization: max(10, total_findings) avoids division by zero
  // and prevents a single finding from tanking the score
  const totalFindings = input.critical + input.notable + input.minor
  const normFactor = Math.max(10, totalFindings)

  const score = 100 - (weightedSum / normFactor) * 100
  return Math.max(0, Math.round(score))
}
```

### Pattern 2: Time Granularity Auto-Adaptation
**What:** Automatically choose daily vs weekly bucketing based on data volume
**When to use:** Trend API endpoints should auto-adapt granularity
**Recommendation:** If data spans <= 30 days, use daily buckets. If > 30 days, use weekly buckets. This keeps charts readable regardless of data volume.

```typescript
// packages/api/src/routes/trends.ts
function getTimeBucket(startDate: Date, endDate: Date): 'day' | 'week' {
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  return days <= 30 ? 'day' : 'week'
}
```

### Pattern 3: Onboarding Detection
**What:** Check repos + installations to determine onboarding state
**When to use:** Dashboard load -- before rendering main content

The repos API already exists. Onboarding status can be derived from:
1. No installations -> Step 1 (Install App)
2. Installations exist but no active repos -> Step 2 (Select Repos)
3. Active repos but no pipeline runs -> Step 3 (Trigger First Review)
4. Pipeline runs exist -> Onboarding complete, show dashboard

```typescript
// GET /api/onboarding/status response shape
interface OnboardingStatus {
  step: 'install' | 'select-repos' | 'first-review' | 'complete'
  installationCount: number
  repoCount: number
  pipelineCount: number
  githubAppUrl: string  // e.g. https://github.com/apps/gstackapp
}
```

### Pattern 4: Recharts Dark Theme Integration
**What:** Recharts styled to match DESIGN.md operations-room aesthetic
**When to use:** All trend charts

Recharts accepts direct hex/rgba values on component props. Use the DESIGN.md tokens directly:

```tsx
// Recharts dark theme config object (reusable across all charts)
export const CHART_THEME = {
  background: 'transparent',        // chart sits on surface bg
  grid: '#2A2F3A',                  // --color-border
  axis: '#8B95A7',                  // --color-text-muted
  tooltip: {
    bg: '#13161C',                  // --color-surface
    border: '#2A2F3A',             // --color-border
    text: '#EDEDED',               // --color-text-primary
  },
} as const
```

### Pattern 5: Wizard Step State Machine
**What:** Multi-step wizard with clear state transitions
**When to use:** Onboarding wizard
**Recommendation:** Use simple useState + step enum. No need for a state machine library at 3 steps.

```tsx
type WizardStep = 'install' | 'select-repos' | 'first-review'

function OnboardingWizard() {
  const { data: status } = useOnboardingStatus()
  const [step, setStep] = useState<WizardStep>(status?.step ?? 'install')

  // Poll onboarding status to auto-advance when webhooks arrive
  // (user installs app in another tab -> webhook fires -> repos appear -> auto-advance)
}
```

### Anti-Patterns to Avoid
- **Pre-computing quality scores in the database:** At single-user scale, computing scores on-the-fly is fast and avoids stale data. A `quality_scores` table adds schema complexity for no performance benefit.
- **Using Recharts ResponsiveContainer with fixed pixel dimensions:** Always wrap charts in ResponsiveContainer for proper resizing. Never use fixed width/height on the chart itself.
- **Polling the GitHub App installation page from the wizard:** There is no API to check if the user has installed the app from the frontend. Instead, poll the GET /api/onboarding/status endpoint (which checks installations in the DB) at a 3-5 second interval while the user is on the install step.
- **Rendering trend charts with < 2 data points:** A single point makes a meaningless chart. Show a "Not enough data" empty state for repos with fewer than 2 completed pipeline runs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart rendering | Custom SVG/Canvas charts | Recharts (already in stack) | Declarative, React-native, handles axes/tooltips/legends/animations |
| Date bucketing | Manual date arithmetic | date-fns `startOfDay`, `startOfWeek`, `format` | Edge cases with timezones, DST, week boundaries |
| SQL aggregation | Manual JS reduce over raw rows | Drizzle `count()`, `sql`, `groupBy()` | Let SQLite do the aggregation -- orders of magnitude faster than fetching all rows |
| Step transitions | XState / state machine library | useState + enum | 3-step wizard is too simple for a state machine library |
| Polling for onboarding updates | Custom setInterval + cleanup | TanStack Query `refetchInterval` option | Automatic cleanup, deduplication, background refetching |

**Key insight:** This phase is almost entirely composition of existing tools. The data model is complete, the UI patterns are established, and Recharts handles all the visualization complexity. The main design work is in the SQL aggregation queries and the onboarding detection logic.

## Common Pitfalls

### Pitfall 1: Recharts ResponsiveContainer Height Collapse
**What goes wrong:** Chart renders as 0px height because ResponsiveContainer needs a parent with explicit height.
**Why it happens:** ResponsiveContainer uses percentage-based height (default 100%). If the parent has no height, the chart collapses.
**How to avoid:** Always give the chart's parent container an explicit height via Tailwind class (e.g., `h-[300px]` or `h-64`). Never rely on flex-grow alone.
**Warning signs:** Chart renders but is invisible. Inspecting the DOM shows 0x0 SVG.

### Pitfall 2: SQLite Timestamp Aggregation Format Mismatch
**What goes wrong:** GROUP BY on timestamps fails because SQLite stores timestamps as integer milliseconds, not date strings.
**Why it happens:** The schema uses `{ mode: 'timestamp_ms' }` which stores Unix milliseconds. You can't GROUP BY day directly on a millisecond integer.
**How to avoid:** Use SQLite's `date()` function to extract date strings: `sql<string>\`date(created_at / 1000, 'unixepoch')\``. This converts millisecond timestamps to 'YYYY-MM-DD' strings for grouping.
**Warning signs:** Each pipeline run becomes its own "bucket" because millisecond values are all unique.

### Pitfall 3: Onboarding Wizard Blocking Dashboard Access
**What goes wrong:** If the wizard takes over the entire page and has no "skip" or "close" option, the user is trapped.
**Why it happens:** Assuming all users arrive fresh. A user might have installed the app externally and just want to see the dashboard.
**How to avoid:** The wizard should be a conditional overlay/section in the dashboard, not a separate route. Always show a "Skip" or "I already installed" escape hatch. The onboarding status endpoint provides the detection, but the user can dismiss it.
**Warning signs:** User clicks around trying to get to the dashboard but can't.

### Pitfall 4: GitHub App Install URL Requires Slug Configuration
**What goes wrong:** The onboarding wizard links to `https://github.com/apps/{slug}` but the slug is not configured anywhere.
**Why it happens:** The GitHub App slug (URL-safe name) is set when the app is registered, not stored in the codebase.
**How to avoid:** Add `GITHUB_APP_SLUG` to the config and .env.example. The wizard renders the install link using this value. If not set, show a manual instruction fallback.
**Warning signs:** Install link goes to 404 or wrong app.

### Pitfall 5: Stacked Area Chart Color Assignment
**What goes wrong:** Chart colors don't match DESIGN.md stage identity colors because Recharts uses its own default palette.
**Why it happens:** Recharts requires explicit `stroke` and `fill` props on each Area/Line component.
**How to avoid:** Use the existing `STAGE_COLORS` and `VERDICT_COLORS` constants from `lib/constants.ts`. Pass them explicitly to each Recharts Area component. Never rely on default Recharts colors.
**Warning signs:** Charts have random blue/green/red colors instead of the spectral identity palette.

### Pitfall 6: Insufficient Data Edge Case
**What goes wrong:** Trend charts render with a single data point or no data, showing a meaningless visualization.
**Why it happens:** New repos with only 1-2 pipeline runs don't have enough history for trends.
**How to avoid:** For repos with < 2 completed pipeline runs, show a contextual empty state: "Need at least 2 reviews to show trends. Open another PR to start tracking." For repos with < 5 runs, show the chart but with a subtle "Limited data" indicator.
**Warning signs:** Chart shows a single dot or a flat line with no trend information.

## Code Examples

### Recharts Line Chart with Dark Theme (Quality Score Over Time)

```tsx
// Source: Recharts docs + DESIGN.md token mapping
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

interface QualityDataPoint {
  date: string    // 'YYYY-MM-DD' or 'YYYY-WXX'
  score: number   // 0-100
}

export function QualityScoreChart({ data }: { data: QualityDataPoint[] }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#2A2F3A" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="#8B95A7"
            tick={{ fontSize: 11, fontFamily: 'Geist' }}
            tickLine={false}
            axisLine={{ stroke: '#2A2F3A' }}
          />
          <YAxis
            domain={[0, 100]}
            stroke="#8B95A7"
            tick={{ fontSize: 11, fontFamily: 'Geist' }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#13161C',
              border: '1px solid #2A2F3A',
              borderRadius: 8,
              color: '#EDEDED',
              fontSize: 13,
              fontFamily: 'Geist',
            }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#C6FF3B"
            strokeWidth={2}
            dot={{ fill: '#C6FF3B', r: 3 }}
            activeDot={{ fill: '#C6FF3B', r: 5, stroke: '#0B0D11', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

### Recharts Stacked Area Chart (Per-Stage Verdict Rates)

```tsx
// Source: Recharts StackedAreaChart example + DESIGN.md stage colors
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { STAGE_COLORS, STAGE_LABELS } from '../../lib/constants'
import type { Stage } from '@gstackapp/shared'

interface VerdictRatePoint {
  date: string
  ceo_pass: number; ceo_flag: number; ceo_block: number
  eng_pass: number; eng_flag: number; eng_block: number
  // ... etc for all stages
}

// Simpler: one chart per stage showing pass/flag/block stacked
interface StageVerdictPoint {
  date: string
  pass: number
  flag: number
  block: number
}

export function VerdictRateChart({
  data,
  stage,
}: {
  data: StageVerdictPoint[]
  stage: Stage
}) {
  const stageColor = STAGE_COLORS[stage]
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} stackOffset="expand" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#2A2F3A" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" stroke="#8B95A7" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis stroke="#8B95A7" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#13161C',
              border: '1px solid #2A2F3A',
              borderRadius: 8,
              color: '#EDEDED',
              fontSize: 13,
            }}
          />
          <Area type="monotone" dataKey="pass" stackId="1" stroke="#2EDB87" fill="rgba(46, 219, 135, 0.3)" />
          <Area type="monotone" dataKey="flag" stackId="1" stroke="#FFB020" fill="rgba(255, 176, 32, 0.3)" />
          <Area type="monotone" dataKey="block" stackId="1" stroke="#FF5A67" fill="rgba(255, 90, 103, 0.3)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

### SQL Aggregation for Trend Data (Drizzle + raw SQL)

```typescript
// packages/api/src/routes/trends.ts
// Quality scores per repo over time using SQLite date bucketing
import { sql } from 'drizzle-orm'
import { db, rawDb } from '../db/client'

// Raw SQL is cleaner for complex aggregation than Drizzle's query builder
function getQualityScoresByRepo(repoId: number) {
  return rawDb.prepare(`
    SELECT
      date(pr.completed_at / 1000, 'unixepoch') AS date,
      SUM(CASE WHEN f.severity = 'critical' THEN 1 ELSE 0 END) AS critical_count,
      SUM(CASE WHEN f.severity = 'notable' THEN 1 ELSE 0 END) AS notable_count,
      SUM(CASE WHEN f.severity = 'minor' THEN 1 ELSE 0 END) AS minor_count
    FROM pipeline_runs pr
    JOIN pull_requests p ON pr.pr_id = p.id
    LEFT JOIN findings f ON f.pipeline_run_id = pr.id
    WHERE p.repo_id = ?
      AND pr.status = 'COMPLETED'
    GROUP BY date(pr.completed_at / 1000, 'unixepoch')
    ORDER BY date ASC
  `).all(repoId)
}

// Per-stage verdict rates over time
function getVerdictRatesByStage(repoId: number, stage: string) {
  return rawDb.prepare(`
    SELECT
      date(pr.completed_at / 1000, 'unixepoch') AS date,
      SUM(CASE WHEN sr.verdict = 'PASS' THEN 1 ELSE 0 END) AS pass_count,
      SUM(CASE WHEN sr.verdict = 'FLAG' THEN 1 ELSE 0 END) AS flag_count,
      SUM(CASE WHEN sr.verdict = 'BLOCK' THEN 1 ELSE 0 END) AS block_count,
      COUNT(*) AS total
    FROM pipeline_runs pr
    JOIN pull_requests p ON pr.pr_id = p.id
    JOIN stage_results sr ON sr.pipeline_run_id = pr.id
    WHERE p.repo_id = ?
      AND sr.stage = ?
      AND pr.status = 'COMPLETED'
    GROUP BY date(pr.completed_at / 1000, 'unixepoch')
    ORDER BY date ASC
  `).all(repoId, stage)
}
```

### Onboarding Status Detection

```typescript
// packages/api/src/routes/onboarding.ts
import { Hono } from 'hono'
import { db } from '../db/client'
import { githubInstallations, repositories, pipelineRuns } from '../db/schema'
import { eq, count } from 'drizzle-orm'

const onboardingApp = new Hono()

onboardingApp.get('/', (c) => {
  const installs = db.select({ count: count() })
    .from(githubInstallations)
    .where(eq(githubInstallations.status, 'active'))
    .get()

  const repos = db.select({ count: count() })
    .from(repositories)
    .where(eq(repositories.isActive, true))
    .get()

  const pipelines = db.select({ count: count() })
    .from(pipelineRuns)
    .get()

  const installCount = installs?.count ?? 0
  const repoCount = repos?.count ?? 0
  const pipelineCount = pipelines?.count ?? 0

  let step: 'install' | 'select-repos' | 'first-review' | 'complete'
  if (installCount === 0) step = 'install'
  else if (repoCount === 0) step = 'select-repos'
  else if (pipelineCount === 0) step = 'first-review'
  else step = 'complete'

  return c.json({
    step,
    installationCount: installCount,
    repoCount: repoCount,
    pipelineCount: pipelineCount,
  })
})

export default onboardingApp
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recharts 2.x | Recharts 3.x available | Late 2025 | 3.x is available (3.8.1) but project pinned ^2.15. Breaking API changes. Stay on 2.x for Phase 1. |
| Manual SQLite date functions | Same (SQLite has no built-in DATE_TRUNC) | N/A | Use `date(ts/1000, 'unixepoch')` for daily bucketing, strftime for weekly |

**Deprecated/outdated:**
- Recharts `<ResponsiveContainer>` padding prop: removed in 2.x, use margin on the chart component instead

## Open Questions

1. **GitHub App Slug**
   - What we know: The install URL is `https://github.com/apps/{slug}`. The slug is set at app registration time.
   - What's unclear: The slug is not in config or .env.example. It needs to be added.
   - Recommendation: Add `GITHUB_APP_SLUG` to config schema and .env.example. Wizard constructs install link from it. If missing, show a fallback message with manual instructions.

2. **Failure Handling Preference Storage (D-04)**
   - What we know: The wizard captures failure handling preference (retry+FLAG, retry+SKIP, fail-fast).
   - What's unclear: No `user_preferences` table exists. This is new schema.
   - Recommendation: Create a simple `settings` table (key-value) or add a `preferences` column to `github_installations`. The preference affects pipeline execution behavior -- the pipeline orchestrator would need to read it. For Phase 1 single-user, a simple key-value `app_settings` table is sufficient.

3. **Trend Chart Placement in Dashboard Layout**
   - What we know: DESIGN.md says "Bottom intelligence strip for trends and cross-repo alerts (always visible, no scroll)." The BottomStrip component currently shows cross-repo intelligence count.
   - What's unclear: The bottom strip is only 40px tall -- too small for charts. Charts need their own section.
   - Recommendation: Expand the dashboard layout. Add a "Trends" section below the PR feed area (or as a tab/view toggle). The bottom strip remains as-is for status indicators. Trend charts are a new dashboard section, likely triggered by a "Trends" nav item in the sidebar or as a collapsible panel.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.1 |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `cd packages/api && npx vitest run` |
| Full suite command | `cd packages/api && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRND-01 | Quality score calculation returns correct weighted scores | unit | `cd packages/api && npx vitest run src/__tests__/scoring.test.ts -x` | Wave 0 |
| TRND-01 | GET /api/trends/scores returns per-repo quality data | integration | `cd packages/api && npx vitest run src/__tests__/trends-route.test.ts -x` | Wave 0 |
| TRND-02 | GET /api/trends/verdicts returns per-stage pass/flag/block rates | integration | `cd packages/api && npx vitest run src/__tests__/trends-route.test.ts -x` | Wave 0 |
| TRND-03 | GET /api/trends/findings returns finding frequency data | integration | `cd packages/api && npx vitest run src/__tests__/trends-route.test.ts -x` | Wave 0 |
| ONBD-01 | GET /api/onboarding/status returns correct step based on DB state | integration | `cd packages/api && npx vitest run src/__tests__/onboarding-route.test.ts -x` | Wave 0 |
| ONBD-02 | Onboarding status transitions through install -> select-repos -> first-review -> complete | unit | `cd packages/api && npx vitest run src/__tests__/onboarding-route.test.ts -x` | Wave 0 |
| ONBD-03 | First review experience (pipeline running in real-time) | manual-only | Visual verification: trigger real pipeline, watch SSE updates in wizard | N/A |
| D-05 | Scoring weights: critical=3x, notable=1x, minor=0x | unit | `cd packages/api && npx vitest run src/__tests__/scoring.test.ts -x` | Wave 0 |
| D-06 | Score formula: 100 - (weighted_sum / norm_factor) | unit | `cd packages/api && npx vitest run src/__tests__/scoring.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/api && npx vitest run`
- **Per wave merge:** `cd packages/api && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/scoring.test.ts` -- covers TRND-01, D-05, D-06 (quality score calculation)
- [ ] `packages/api/src/__tests__/trends-route.test.ts` -- covers TRND-01, TRND-02, TRND-03 (aggregation endpoints)
- [ ] `packages/api/src/__tests__/onboarding-route.test.ts` -- covers ONBD-01, ONBD-02 (onboarding status detection)

## Sources

### Primary (HIGH confidence)
- Existing codebase: `packages/api/src/db/schema.ts`, `packages/api/src/routes/pipelines.ts`, `packages/web/src/` -- full frontend and API patterns
- [Recharts docs](https://recharts.github.io/en-US/api/) -- AreaChart, LineChart, stackId, stackOffset props
- [Drizzle ORM docs](https://orm.drizzle.team/docs/select) -- groupBy, count(), sql operator for aggregation
- [GitHub Apps setup URL docs](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url) -- installation_id query param, security caveats

### Secondary (MEDIUM confidence)
- [Recharts StackedAreaChart example](https://recharts.github.io/en-US/examples/StackedAreaChart/) -- stackId pattern for multiple Area components
- [PostHog Recharts tutorial](https://posthog.com/tutorials/recharts) -- dark theme styling patterns
- [GitHub App installation flow](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app) -- public install page at github.com/apps/{slug}

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- established patterns from prior phases, straightforward composition
- Pitfalls: HIGH -- verified against existing codebase patterns (timestamp format, Recharts behavior)
- Quality scoring algorithm: MEDIUM -- normalization factor is Claude's discretion, recommended max(10, total) but may need tuning

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable libraries, no fast-moving dependencies)
