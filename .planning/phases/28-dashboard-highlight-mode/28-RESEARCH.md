# Phase 28: Dashboard Highlight Mode - Research

**Researched:** 2026-03-21
**Domain:** Full-stack feature (SQLite/Drizzle + Hono API + React dashboard)
**Confidence:** HIGH

## Summary

Phase 28 adds "highlight mode" to the Mission Control dashboard so the user sees which projects changed since their last visit the moment they open the page. This is a full-stack feature spanning a new database table, two API endpoints, a new React hook, modifications to the grouping/sorting logic, visual accent treatment on ProjectRow, and a summary count badge in the WhatsNewStrip.

The codebase already has every pattern needed. The ProjectRow component already uses a conditional 3px left border for selected and stale states. The WhatsNewStrip already renders badge-style counts alongside discovery/star badges. The fetchCounter pattern used by useProjects and every other hook is the established refetch mechanism. Drizzle ORM handles schema and migrations. No new dependencies are required.

**Primary recommendation:** Implement as a thin vertical slice -- new `client_visits` table, two Hono routes (`POST /api/visits` + `GET /api/visits/last`), a `useLastVisit` hook that pings on mount and exposes the previous timestamp, then thread `changedSlugs` through the existing DepartureBoard/ProjectGroup/ProjectRow component tree for sorting and accent styling, and add a count badge to WhatsNewStrip.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Left accent bar -- subtle 3px left border in terracotta/indigo on changed project rows
- **D-02:** Does not compete with existing health dots, convergence badges, or discovery popovers
- **D-03:** Changed projects float to top of their group (Active/Idle/Stale)
- **D-04:** "N projects changed since yesterday" count in top strip, alongside existing What's New discovery/star badges
- **D-05:** Visible without scrolling -- leverages the existing ambient awareness zone
- **D-06:** Highlights clear on scroll/interaction -- once user scrolls past or clicks a highlighted project, highlight fades
- **D-07:** Natural "I've seen this" behavior -- no manual dismiss action needed
- **D-08:** Server stores last-visit timestamp per client via API endpoint (not localStorage-only) -- per DASH-01
- **D-09:** Client sends "visit" ping on dashboard load, server records timestamp

### Claude's Discretion
- Exact accent bar color token (terracotta vs indigo, light vs dark mode)
- Float-to-top animation (instant vs smooth transition)
- Scroll/interaction detection implementation
- API endpoint design for visit tracking

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | Server stores last-visit timestamp per client via API endpoint | New `client_visits` SQLite table + `POST /api/visits` and `GET /api/visits/last` endpoints following existing Hono route pattern |
| DASH-02 | Dashboard highlights projects with activity since last visit (float changed rows to top of group) | Modify `groupProjectsByActivity` or add post-grouping sort in DepartureBoard; add `changedSlugs` Set prop through ProjectGroup to ProjectRow for conditional border-l styling |
| DASH-03 | Dashboard shows summary count of changed projects since last visit | Add count badge to WhatsNewStrip component matching existing discovery/star badge pattern |
| DASH-04 | Highlight treatment reviewed against existing badge density | ProjectRow already has 3px left border states (selected=terracotta, stale=amber); highlight accent uses a distinct color (indigo recommended for light mode, terracotta/12 for dark) that does not conflict with health dots (right side), convergence badges (right side), or discovery popovers (WhatsNewStrip section) |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | ^4.6.0 | API routes | Already used for all 20+ route files |
| Drizzle ORM | ^0.38.0 | Database schema + queries | Already used for all tables |
| better-sqlite3 | ^11.7.0 | SQLite driver | Already used |
| React | ^19.0.0 | Dashboard UI | Already used |
| Tailwind CSS | ^4.0.0 | Styling | Already used with custom theme tokens |
| Vitest | (devDep) | Testing | Already used for all tests |

### No New Dependencies Needed

This phase requires zero new packages. Everything is built with existing stack.

## Architecture Patterns

### Recommended Project Structure (new files only)
```
packages/
  api/
    drizzle/
      0010_client_visits.sql          # Migration
    src/
      db/
        queries/
          visits.ts                   # DB query functions
      routes/
        visits.ts                     # Hono route handler
  shared/
    src/
      schemas/
        visit.ts                      # Zod schemas
      types/
        index.ts                      # (extend with Visit types)
  web/
    src/
      hooks/
        use-last-visit.ts             # Hook: ping visit + return lastVisitAt
      lib/
        highlight.ts                  # Pure function: compute changedSlugs from projects + lastVisitAt
      __tests__/
        lib/
          highlight.test.ts           # Unit tests for highlight logic
```

### Pattern 1: Visit Tracking (Server-Side Timestamp)

**What:** A `client_visits` table stores one row per client identifier with the last-visit timestamp. On dashboard load, the client GETs the last visit timestamp, then POSTs a new visit. The response to GET returns the *previous* timestamp, which the client uses to determine "changed since".

**When to use:** Single-user system with potential for multiple clients (web dashboard, future iOS, future CLI).

**Design:**

```sql
-- 0010_client_visits.sql
CREATE TABLE `client_visits` (
  `client_id` text PRIMARY KEY NOT NULL,
  `last_visit_at` text NOT NULL,
  `previous_visit_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
```

The `previous_visit_at` field stores the prior visit timestamp so the client can fetch it in a single GET without needing two round trips. On POST, the server copies `last_visit_at` to `previous_visit_at`, then sets `last_visit_at` to now.

**Client identifier:** Use a simple string like `"web"`, `"ios"`, `"cli"`. For the web dashboard, hardcode `"web"`. This avoids over-engineering (no UUIDs, no sessions, no cookies) while supporting future multi-client.

**API Endpoints:**

```typescript
// GET /api/visits/last?clientId=web
// Returns: { clientId: "web", lastVisitAt: "2026-03-20T06:30:00Z", previousVisitAt: "2026-03-19T07:00:00Z" }
// Returns 404 if no previous visit (first time user)

// POST /api/visits
// Body: { clientId: "web" }
// Returns: { clientId: "web", lastVisitAt: "2026-03-21T06:30:00Z" }
```

### Pattern 2: Changed Project Detection (Client-Side Computation)

**What:** The client compares each project's `lastCommitDate` (already in the ProjectItem data) against `previousVisitAt` to build a `Set<string>` of changed slugs. This is a pure function, easy to test, no server computation needed.

**Why client-side:** The `/api/projects` endpoint already returns `lastCommitDate` per project. Adding a server endpoint that takes a timestamp and returns changed slugs would duplicate data the client already has. Keep the API simple.

```typescript
// lib/highlight.ts
export function computeChangedSlugs(
  projects: ProjectItem[],
  lastVisitAt: string | null
): Set<string> {
  if (!lastVisitAt) return new Set(); // First visit, no highlights

  const visitTime = new Date(lastVisitAt).getTime();
  const changed = new Set<string>();

  for (const project of projects) {
    if (!project.lastCommitDate) continue;
    const commitTime = new Date(project.lastCommitDate).getTime();
    if (commitTime > visitTime) {
      changed.add(project.slug);
    }
  }

  return changed;
}
```

### Pattern 3: Float-to-Top Sorting Within Groups

**What:** After `groupProjectsByActivity` groups projects into Active/Idle/Stale, apply a secondary sort that puts changed projects first within each group, preserving the existing most-recent-first order within the changed and unchanged subsets.

**Implementation point:** This should be a post-processing step applied in the `useProjects` hook or in `DepartureBoard`, not inside `groupProjectsByActivity` itself (to keep that function pure and unchanged for existing tests).

```typescript
// In DepartureBoard or a utility:
function sortWithChangedFirst(
  projects: ProjectItem[],
  changedSlugs: Set<string>
): ProjectItem[] {
  return [...projects].sort((a, b) => {
    const aChanged = changedSlugs.has(a.slug) ? 0 : 1;
    const bChanged = changedSlugs.has(b.slug) ? 0 : 1;
    if (aChanged !== bChanged) return aChanged - bChanged;
    // Within same changed/unchanged status, keep existing sort (most recent first)
    const aTime = a.lastCommitDate ? new Date(a.lastCommitDate).getTime() : 0;
    const bTime = b.lastCommitDate ? new Date(b.lastCommitDate).getTime() : 0;
    return bTime - aTime;
  });
}
```

### Pattern 4: Highlight Fade on Interaction (D-06, D-07)

**What:** Highlights clear when the user scrolls past or clicks a highlighted project. This creates a natural "I've seen this" interaction without an explicit dismiss button.

**Recommended implementation:** Use a client-side `Set<string>` state (`seenSlugs`) that starts empty. When a highlighted project is clicked (onSelect), add it to seenSlugs. For scroll detection, use an IntersectionObserver on each highlighted ProjectRow -- once the row has been scrolled into and then out of the viewport (i.e., user scrolled past it), mark it as seen. Projects in `seenSlugs` lose their highlight styling.

**Simpler alternative (recommended):** Just clear on click. Scroll-based clearing adds complexity and can feel jittery. Clicking a project already selects it (changing the border to terracotta/selected), which naturally communicates "seen". Consider starting with click-to-clear and adding scroll detection later if needed.

### Pattern 5: Summary Count in WhatsNewStrip

**What:** Add a "N projects changed since yesterday" badge to the WhatsNewStrip, using the same styling pattern as discovery/star badges.

**Integration:** WhatsNewStrip currently returns `null` when discoveries and stars are both empty. The changed count should be a third condition that keeps the strip visible. The strip already has a "What's New" label, which semantically fits the changed-projects count.

### Anti-Patterns to Avoid
- **Don't store visit timestamps in localStorage only:** The requirement explicitly says "via API endpoint." localStorage would also not work for multi-client (iOS, CLI). Server-side is the requirement.
- **Don't modify `groupProjectsByActivity` sorting:** That function is well-tested and handles the core grouping logic. Add a separate sort step for highlight promotion to avoid breaking existing behavior.
- **Don't fetch changed slugs from the server:** The client already has all project data with `lastCommitDate`. Computing changed slugs client-side avoids a new server endpoint and keeps the architecture simple.
- **Don't use WebSocket or SSE for visit tracking:** This is a simple get/set operation that happens once per page load. HTTP endpoints are sufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scroll visibility detection | Custom scroll event listeners with getBoundingClientRect | IntersectionObserver API | Browser-native, performant, handles edge cases (overflow containers, resizes) |
| Relative time display | Custom "since yesterday" formatting | Existing `formatRelativeTime` in `lib/time.ts` | Already used in ProjectRow, consistent formatting |
| UUID for visit records | nanoid or custom ID generation | Simple string client IDs ("web", "ios", "cli") | Single-user system with known clients; no need for randomized IDs |

**Key insight:** This phase adds no new complexity -- it wires together existing patterns (table, route, hook, conditional styling) in a well-established codebase.

## Common Pitfalls

### Pitfall 1: First-Visit Edge Case
**What goes wrong:** On first visit, there is no `previousVisitAt`, so all projects appear as "changed" (or none do, depending on implementation).
**Why it happens:** No prior visit record exists.
**How to avoid:** When `previousVisitAt` is null (first visit), return an empty `changedSlugs` set. Show no highlights. The first POST creates the baseline. On the *second* visit, highlights work correctly.
**Warning signs:** Every project has a highlight accent on first load.

### Pitfall 2: Border-Left Style Conflict with Selected/Stale States
**What goes wrong:** The "changed" accent border-l competes with the existing selected (terracotta) and stale (amber) border-l states, creating visual confusion.
**Why it happens:** ProjectRow already uses `border-l-[3px]` for three states: selected (terracotta), stale (amber-500/40), and default (transparent). Adding a fourth state needs clear precedence.
**How to avoid:** Establish explicit priority: **selected > stale > changed > default**. When a project is selected, it always shows the selected terracotta border regardless of changed status. When stale, the stale amber border takes precedence. The changed highlight only shows on non-selected, non-stale projects.
**Warning signs:** A project showing both amber stale border and changed highlight.

### Pitfall 3: Visit Ping Race Condition
**What goes wrong:** The client POSTs a new visit before the GET returns, so it uses the just-updated timestamp instead of the previous one.
**Why it happens:** If both requests fire simultaneously on mount.
**How to avoid:** The hook must GET first, store the result, then POST. Use sequential requests, not parallel. The `useLastVisit` hook should: (1) GET previous visit, (2) compute highlights, (3) POST new visit. This order is critical.
**Warning signs:** Highlights never appear because `previousVisitAt` is always within seconds of current time.

### Pitfall 4: WhatsNewStrip Conditional Rendering
**What goes wrong:** WhatsNewStrip returns `null` when there are no discoveries and no stars, even if there are changed projects to display.
**Why it happens:** The current early-return check only considers discoveries and stars.
**How to avoid:** Add `changedCount` to the condition: return null only when all three (discoveries, stars, changedCount) are zero/empty.
**Warning signs:** "N projects changed" badge disappears when there happen to be no discoveries or stars.

### Pitfall 5: Stale Data After SSE Refresh
**What goes wrong:** After a `scan:complete` SSE event triggers a refetch, the changed slugs don't update because they're computed from a stale `previousVisitAt`.
**Why it happens:** The visit timestamp is fetched once on mount, but project data refreshes via SSE.
**How to avoid:** The `changedSlugs` computation should use `useMemo` with dependencies on both `projects` and `previousVisitAt`. When projects refetch (new commit detected), the memo recomputes and correctly identifies newly-changed projects.
**Warning signs:** A project that received a new commit during the session doesn't get highlighted.

## Code Examples

### Drizzle Schema (new table)
```typescript
// packages/api/src/db/schema.ts (addition)
export const clientVisits = sqliteTable("client_visits", {
  clientId: text("client_id").primaryKey(),
  lastVisitAt: text("last_visit_at").notNull(),
  previousVisitAt: text("previous_visit_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

### Migration SQL
```sql
-- packages/api/drizzle/0010_client_visits.sql
CREATE TABLE `client_visits` (
  `client_id` text PRIMARY KEY NOT NULL,
  `last_visit_at` text NOT NULL,
  `previous_visit_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
```

### Hono Route (follows existing pattern from discoveries.ts)
```typescript
// packages/api/src/routes/visits.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { DatabaseInstance } from "../db/index.js";

const recordVisitSchema = z.object({
  clientId: z.string().min(1).max(50),
});

const getVisitQuerySchema = z.object({
  clientId: z.string().min(1).max(50),
});

export function createVisitRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .get("/visits/last", zValidator("query", getVisitQuerySchema), (c) => {
      const { clientId } = c.req.valid("query");
      const db = getInstance().db;
      // Query for previous visit...
      // Return { clientId, lastVisitAt, previousVisitAt }
    })
    .post("/visits", zValidator("json", recordVisitSchema), (c) => {
      const { clientId } = c.req.valid("json");
      const db = getInstance().db;
      // Upsert: copy lastVisitAt -> previousVisitAt, set lastVisitAt = now
      // Return { clientId, lastVisitAt }
    });
}
```

### React Hook (follows fetchCounter pattern from use-projects.ts)
```typescript
// packages/web/src/hooks/use-last-visit.ts
export function useLastVisit(): {
  previousVisitAt: string | null;
  loading: boolean;
} {
  // On mount: GET /api/visits/last?clientId=web
  // Store previousVisitAt
  // Then POST /api/visits { clientId: "web" }
  // Return previousVisitAt for highlight computation
}
```

### ProjectRow Highlight Styling (existing pattern extended)
```typescript
// In ProjectRow className logic, current:
// isSelected -> border-terracotta
// stale -> border-amber-500/40
// default -> border-transparent
//
// Add: isChanged && !isSelected && !stale -> border-indigo-400/60
// Priority: selected > stale > changed > default
```

### WhatsNewStrip Badge Addition
```typescript
// In WhatsNewStrip, add alongside discoveries/stars:
{changedCount > 0 && (
  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-semibold">
    {changedCount} changed
  </span>
)}
```

## Color Recommendation (Claude's Discretion)

The accent bar color should be **indigo** for the "changed" state:

| Mode | Token | Value | Rationale |
|------|-------|-------|-----------|
| Light | `border-indigo-400/60` | Blue-violet accent | Distinct from terracotta (selected), amber (stale), and all health colors (rust, gold, sage). Cool-toned vs existing warm palette = easy visual separation. |
| Dark | `border-indigo-400/40` | Blue-violet accent (dimmer) | Lower opacity for dark mode consistency with other conditional borders |
| Badge bg | `bg-indigo-500/10` | Subtle background | Matches discovery (terracotta/10) and star (gold-status/10) badge pattern |
| Badge text | `text-indigo-400` | Badge text color | Matches badge background family |

**Why not terracotta:** Already used for selected state (border-l) and capture count badges. Using terracotta for "changed" would create visual confusion with "selected."

**Why not a warm color:** The existing palette is warm (terracotta, amber, rust, gold, sage). A cool accent (indigo) provides instant visual differentiation for "something new happened" vs "selected/stale/unhealthy."

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localStorage for visit tracking | Server-side per-client timestamps | DASH-01 requirement | Enables multi-client (iOS, CLI) visit tracking |
| No change detection on dashboard | Highlight mode with float-to-top | Phase 28 | Morning "at a glance" experience |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (already configured) |
| Config file | `packages/api/vitest.config.ts`, `packages/web/vitest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | POST /api/visits stores timestamp, GET returns previous | unit (API route) | `pnpm --filter @mission-control/api test -- --testPathPattern visits` | Wave 0 |
| DASH-01 | client_visits table upsert with previous_visit_at rotation | unit (DB query) | `pnpm --filter @mission-control/api test -- --testPathPattern visits` | Wave 0 |
| DASH-02 | computeChangedSlugs returns correct set based on lastVisitAt | unit (lib) | `pnpm --filter @mission-control/web test -- --testPathPattern highlight` | Wave 0 |
| DASH-02 | sortWithChangedFirst puts changed projects first, preserves order | unit (lib) | `pnpm --filter @mission-control/web test -- --testPathPattern highlight` | Wave 0 |
| DASH-03 | WhatsNewStrip renders count when changedCount > 0, hides when 0 | unit (component) | `pnpm --filter @mission-control/web test -- --testPathPattern whats-new` | Wave 0 |
| DASH-04 | ProjectRow uses correct border class based on priority (selected > stale > changed) | unit (component or lib) | `pnpm --filter @mission-control/web test -- --testPathPattern highlight` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green + typecheck before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/routes/visits.test.ts` -- covers DASH-01 API endpoints
- [ ] `packages/api/src/__tests__/db/visits.test.ts` -- covers DASH-01 DB queries
- [ ] `packages/web/src/__tests__/lib/highlight.test.ts` -- covers DASH-02 changed slug computation and sorting
- [ ] Existing `packages/api/src/__tests__/helpers/setup.ts` sufficient for test infrastructure

## Open Questions

1. **Scroll-to-clear vs click-to-clear**
   - What we know: D-06 says "highlights clear on scroll/interaction." D-07 says "natural I've seen this behavior."
   - What's unclear: Should scroll detection be IntersectionObserver-based (complex but smooth) or should we start with click-to-clear only (simple, natural)?
   - Recommendation: Start with click-to-clear. A clicked project becomes "selected" which already changes the border, so the highlight disappears naturally. If scroll-based clearing is desired, it can be added as a follow-up without API changes.

2. **Animation for float-to-top**
   - What we know: Claude's discretion per CONTEXT.md.
   - What's unclear: Should projects animate smoothly to their new position or snap into place?
   - Recommendation: Instant reorder (no animation). The dashboard loads with projects already in position. CSS `transition-all duration-200` already on ProjectRow handles hover/select smoothly, but initial sort order is computed before render, so no animation is needed or visible.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis:** Direct reading of all relevant source files (schema.ts, project-row.tsx, departure-board.tsx, whats-new-strip.tsx, use-projects.ts, use-sse.ts, app.css, grouping.ts, etc.)
- **Migration system:** Drizzle migration journal and existing SQL files (0000-0009)
- **Test patterns:** Existing test helpers (setup.ts), route tests (discoveries.test.ts), and lib tests (grouping.test.ts)

### Secondary (MEDIUM confidence)
- **Color recommendation:** Based on analysis of existing color palette in app.css theme and SEVERITY_COLORS in health-colors.ts; indigo provides clear visual separation from warm palette

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all patterns exist in codebase
- Architecture: HIGH -- direct extension of existing table/route/hook/component patterns
- Pitfalls: HIGH -- identified from reading actual component code (border-l conflicts, WhatsNewStrip null return, race conditions)
- Color choice: MEDIUM -- informed recommendation based on palette analysis, but subjective

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable -- no external dependencies or fast-moving APIs)
