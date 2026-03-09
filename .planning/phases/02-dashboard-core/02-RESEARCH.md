# Phase 2: Dashboard Core - Research

**Researched:** 2026-03-09
**Domain:** React dashboard with Tailwind CSS v4 theming, responsive layout, API data fetching
**Confidence:** HIGH

## Summary

Phase 2 builds the "smarter in 3 seconds" dashboard experience on top of a solid Phase 1 foundation. The existing codebase provides a working React 19 + Vite 6 + Tailwind CSS v4 scaffold with a proven API data path (`fetch` + Hono RPC client). The project list API already returns per-project scan data (branch, dirty, last commit), and the detail endpoint returns full commit arrays (up to 5) plus GSD state -- both critical for the hero card.

The primary technical challenge is implementing a warm, opinionated dual-theme (light/dark) color system using Tailwind v4's CSS-native `@theme` directive and `@custom-variant` for class-based dark mode toggle. This is well-supported by the current stack -- Tailwind v4.2.1's `@theme` turns CSS custom properties into utility classes, and `@custom-variant dark` enables class-based toggling with localStorage persistence. No additional libraries are needed for theming.

The secondary challenge is structuring data fetching efficiently: the list endpoint provides enough data for departure board rows, but the hero card requires a separate detail fetch for the selected project's commit timeline and GSD state. This is a standard pattern with React 19's built-in capabilities.

**Primary recommendation:** Build with zero additional dependencies. Use Tailwind v4 CSS-native theming, a hand-written `formatRelativeTime()` utility using `Intl.RelativeTimeFormat`, and React 19's native state management. Save TanStack Query for Phase 3+ when data mutation complexity warrants it.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Three activity groups: Active (commit within 7 days), Idle (7-30 days), Stale (30+ days) based on last commit timestamp
- Within each group, sorted by most recent commit first
- Two-line rows: name + metadata on line 1, tagline on line 2
- Group headers always expanded -- no collapsible sections
- All groups visible on page load
- Hero card at top of page, above departure board
- Hero shows last 3-5 commits as vertical mini-timeline with relative timestamps
- GSD phase state shown as small badge/tag if project has `.planning/`
- Click any project row to swap hero card instantly -- no animation, no confirmation
- Hero defaults to most recently active project on initial load
- No AI-generated narrative in Phase 2 (Phase 5 adds AI narratives)
- Both warm-light and warm-dark modes supported
- Warm light is the default
- Toggle available to switch to warm dark mode
- Accent color system: #d4713a (terracotta primary), #e8a04c (warm amber highlight), #fef3e2 (active light bg), #2d1f14 (active dark bg)
- Status colors: sage green (success), gold (warning), rust (dirty)
- System font stack (zero load time)
- Monospace (ui-monospace) for branch names, commit hashes, code-like content
- Three breakpoints: mobile (<640px), tablet (640-1024px), desktop (>1024px)
- Mobile: project name, last activity time, dirty indicator only. No taglines/branches
- Tablet: Full desktop layout, just narrower spacing
- Desktop: Full experience, comfortable spacing

### Claude's Discretion
- Exact warm color palette values (accent system locked, backgrounds/text flexible)
- Light/dark mode toggle implementation (CSS variables, class toggle, localStorage)
- Loading skeleton or spinner design
- Empty state if no projects configured
- Exact spacing, padding, and layout proportions
- Host badge design (local vs mac-mini indicator)
- How relative times are formatted ("2 hours ago" vs "2h" vs "today")
- Component architecture (how to split into React components)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Single-page dashboard loads <1s showing all projects grouped by Active/Idle/Stale | Grouping logic uses `lastCommitTime` from list endpoint; Tailwind v4 system fonts = zero font load; no additional dependencies = minimal bundle |
| DASH-02 | Each project row shows: name, tagline, host badge, branch, last activity time, dirty indicator | All fields available from `/api/projects` list endpoint. Relative time formatting via `Intl.RelativeTimeFormat` |
| DASH-03 | Hero card with last 3-5 commits, GSD state, and "last context" narrative | Detail endpoint `/api/projects/:slug` returns `commits[]` and `gsdState`. Phase 2 uses commit timeline as narrative (AI narrative deferred to Phase 5) |
| DASH-04 | Click any project row to swap it into the hero position | React state management: `selectedSlug` state, detail fetch on selection change |
| DASH-10 | Responsive layout renders readable project status on mobile screens | Tailwind v4 mobile-first breakpoints: base (mobile) -> `sm:` (640px) -> `lg:` (1024px) with progressive disclosure |
| DASH-11 | Visual identity follows Arc browser energy: warm, opinionated, distinctive | Tailwind v4 `@theme` with CSS custom properties for warm palette, `@custom-variant dark` for dual-mode theming |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | UI rendering | Already installed, project uses React 19 |
| react-dom | 19.2.4 | DOM rendering | Already installed |
| Tailwind CSS | 4.2.1 | Utility-first styling | Already installed, CSS-native config (no JS config file) |
| @tailwindcss/vite | 4.2.1 | Vite integration | Already installed, replaces PostCSS plugin |
| Vite | 6.4.1 | Build tool + dev server | Already installed with proxy to API on :3000 |
| Hono | 4.6.0+ | RPC client (hc) for type-safe API calls | Already installed, `packages/web/src/api/client.ts` has working `hc<AppType>` setup |
| @mission-control/shared | workspace | Zod schemas + TypeScript types | Already installed, provides `Project` type and schemas |

### Supporting (No New Dependencies Needed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Intl.RelativeTimeFormat` | Browser native | Relative time formatting | Built into all modern browsers and Node.js. No library needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch + useState | TanStack Query | TQ adds caching, refetch, mutations -- overkill for Phase 2's read-only dashboard. Add in Phase 3 when capture mutations arrive |
| Intl.RelativeTimeFormat | date-fns `formatDistance` | date-fns adds ~2KB but Intl is native and sufficient for "2 hours ago" formatting |
| Hand-written grouping logic | lodash `groupBy` | Single function not worth a dependency |
| CSS custom properties | CSS-in-JS (styled-components, emotion) | Tailwind v4 already handles theming via CSS variables natively |

**Installation:**
```bash
# No new packages needed. Everything is already installed.
pnpm install  # Ensure lockfile is up to date
```

## Architecture Patterns

### Recommended Project Structure
```
packages/web/src/
├── api/
│   └── client.ts              # Existing Hono RPC client
├── components/
│   ├── layout/
│   │   └── dashboard-layout.tsx    # Page shell, header, theme toggle
│   ├── hero/
│   │   ├── hero-card.tsx           # Expanded hero card with commit timeline
│   │   └── commit-timeline.tsx     # Vertical commit list with relative times
│   ├── departure-board/
│   │   ├── departure-board.tsx     # Groups container
│   │   ├── project-group.tsx       # Single group (Active/Idle/Stale) with header
│   │   └── project-row.tsx         # Individual project row (clickable)
│   └── ui/
│       ├── host-badge.tsx          # Local/Mac Mini badge
│       ├── gsd-badge.tsx           # GSD phase state badge
│       ├── dirty-indicator.tsx     # Uncommitted changes indicator
│       └── loading-skeleton.tsx    # Skeleton loading states
├── hooks/
│   ├── use-projects.ts         # Fetch + group project list
│   ├── use-project-detail.ts   # Fetch single project detail for hero
│   └── use-theme.ts            # Dark/light mode toggle with localStorage
├── lib/
│   ├── time.ts                 # formatRelativeTime utility
│   ├── grouping.ts             # groupProjectsByActivity function
│   └── types.ts                # Frontend-specific derived types (if any)
├── app.css                     # Tailwind imports + @theme + @custom-variant
├── App.tsx                     # Root component (will be rewritten)
├── main.tsx                    # Entry point (keep as-is)
└── vite-env.d.ts               # Vite type declarations
```

### Pattern 1: CSS-Native Theming with Tailwind v4

**What:** Define the entire warm color system using `@theme` directive and CSS custom properties, with class-based dark mode via `@custom-variant`.

**When to use:** This phase and all future phases. The theme is the visual identity.

**Example:**
```css
/* app.css */
@import "tailwindcss";

/* Class-based dark mode toggle */
@custom-variant dark (&:where(.dark, .dark *));

/* Design tokens that generate utility classes */
@theme {
  /* Accent colors (locked) */
  --color-terracotta: #d4713a;
  --color-amber-warm: #e8a04c;

  /* Status colors */
  --color-sage: #6b8f71;
  --color-gold-status: #c49b2a;
  --color-rust: #b7410e;

  /* Light mode surfaces */
  --color-surface: #faf6f1;
  --color-surface-warm: #fef3e2;
  --color-surface-elevated: #ffffff;

  /* Dark mode surfaces */
  --color-surface-dark: #1a1210;
  --color-surface-warm-dark: #2d1f14;
  --color-surface-elevated-dark: #241a12;

  /* Text colors */
  --color-text-primary: #1c1210;
  --color-text-secondary: #6b5c52;
  --color-text-muted: #9c8b7e;
  --color-text-primary-dark: #f0e8e0;
  --color-text-secondary-dark: #b8a898;
  --color-text-muted-dark: #7d6e62;

  /* Font stacks */
  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

/* Base styles for light mode (default) */
@layer base {
  body {
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-sans);
  }

  /* Dark mode overrides */
  .dark body,
  body.dark {
    background-color: var(--color-surface-dark);
    color: var(--color-text-primary-dark);
  }
}
```

**Source:** [Tailwind CSS v4 @theme docs](https://tailwindcss.com/docs/theme), [Tailwind CSS v4 dark mode docs](https://tailwindcss.com/docs/dark-mode)

### Pattern 2: Activity Grouping Logic

**What:** Classify projects into Active/Idle/Stale based on last commit timestamp, compute once from API data.

**When to use:** Every time project list data is fetched.

**Example:**
```typescript
// lib/grouping.ts
type ActivityGroup = "active" | "idle" | "stale";

interface GroupedProjects {
  active: ProjectWithScan[];
  idle: ProjectWithScan[];
  stale: ProjectWithScan[];
}

const ACTIVE_THRESHOLD_DAYS = 7;
const IDLE_THRESHOLD_DAYS = 30;

function getActivityGroup(lastCommitTime: string | null): ActivityGroup {
  if (!lastCommitTime) return "stale";

  const commitDate = new Date(lastCommitTime);
  const now = new Date();
  const diffDays = (now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays <= ACTIVE_THRESHOLD_DAYS) return "active";
  if (diffDays <= IDLE_THRESHOLD_DAYS) return "idle";
  return "stale";
}

export function groupProjectsByActivity(projects: ProjectWithScan[]): GroupedProjects {
  const groups: GroupedProjects = { active: [], idle: [], stale: [] };

  for (const project of projects) {
    const group = getActivityGroup(project.lastCommitTime);
    groups[group].push(project);
  }

  // Sort within each group: most recent commit first
  const sortByRecent = (a: ProjectWithScan, b: ProjectWithScan) => {
    const aTime = a.lastCommitTime ? new Date(a.lastCommitTime).getTime() : 0;
    const bTime = b.lastCommitTime ? new Date(b.lastCommitTime).getTime() : 0;
    return bTime - aTime;
  };

  groups.active.sort(sortByRecent);
  groups.idle.sort(sortByRecent);
  groups.stale.sort(sortByRecent);

  return groups;
}
```

### Pattern 3: Fetch-on-Select Hero Card

**What:** The departure board uses the list endpoint. When user clicks a row (or on initial load), fetch the detail endpoint for that project to get full commits + GSD state.

**When to use:** Hero card rendering.

**Example:**
```typescript
// hooks/use-project-detail.ts
import { useState, useEffect } from "react";

interface ProjectDetail {
  // ... full project with commits[] and gsdState
}

export function useProjectDetail(slug: string | null) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug) { setDetail(null); return; }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/projects/${slug}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) {
          setDetail(data.project);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [slug]);

  return { detail, loading };
}
```

### Pattern 4: Theme Toggle with localStorage

**What:** Toggle between warm-light and warm-dark modes. Persist preference. Avoid FOUC (flash of unstyled content).

**When to use:** Dashboard shell / layout component.

**Example:**
```typescript
// hooks/use-theme.ts
import { useState, useEffect } from "react";

type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage first, then system preference
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("mc-theme") as Theme | null;
      if (stored) return stored;
    }
    return "light"; // Warm light is the default
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("mc-theme", theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === "light" ? "dark" : "light");

  return { theme, setTheme, toggle };
}
```

**FOUC prevention** -- add inline script to `index.html` `<head>`:
```html
<script>
  (function() {
    var t = localStorage.getItem('mc-theme');
    if (t === 'dark') document.documentElement.classList.add('dark');
  })();
</script>
```

**Source:** [Tailwind CSS v4 dark mode docs](https://tailwindcss.com/docs/dark-mode)

### Anti-Patterns to Avoid
- **Fetching detail for ALL projects on load:** Only fetch the detail endpoint for the currently selected hero project. The list endpoint provides enough for departure board rows.
- **Using `useEffect` for derived data:** Activity grouping is synchronous computation from the project list. Use `useMemo`, not `useEffect` + `useState`.
- **Animating hero card transitions:** CONTEXT.md explicitly says "no animation, no confirmation" for hero swap. Just replace the data.
- **Using Tailwind v3 config patterns:** No `tailwind.config.js`. Tailwind v4 uses `@theme` in CSS. Do not create a config file.
- **Nesting dark mode in @layer base for body styles:** Use CSS custom properties in `@theme` so Tailwind generates utility classes. Apply mode differences through `dark:` variant utilities on elements.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Relative time formatting | Custom "X days ago" string builder | `Intl.RelativeTimeFormat` browser API | Handles locale, pluralization, edge cases. Zero dependency |
| CSS theming system | Runtime JS theme engine | Tailwind v4 `@theme` + CSS custom properties | CSS variables auto-cascade, zero JS overhead, SSR-safe |
| Dark mode toggle | Custom media query listener | `@custom-variant dark` + class toggle | Tailwind v4 native, works with all `dark:` utilities |
| API response types | Manual interface definitions | `@mission-control/shared` Zod schemas + `z.infer` | Single source of truth, already established in Phase 1 |
| Icon system | Custom SVG components | Inline SVGs or a tiny set of hand-picked SVGs | Only 3-4 icons needed (dirty indicator, host badge, theme toggle, maybe chevron). Not worth an icon library |

**Key insight:** This phase has zero new dependency requirements. Everything needed is either built into the browser (Intl), already installed (React 19, Tailwind v4, Hono client), or trivially implementable as a pure function.

## Common Pitfalls

### Pitfall 1: lastCommitTime is a Relative String, Not a Timestamp
**What goes wrong:** The project list API returns `lastCommitTime` as git's relative time string (e.g., "2 hours ago"), not an ISO timestamp. You cannot parse this to compute activity groups (Active/Idle/Stale) or sort by recency.
**Why it happens:** `git log --format=%ar` produces relative strings. The scanner passes these through directly.
**How to avoid:** The project detail endpoint (or scanner cache) has the raw commit data. Two options: (1) modify the `/api/projects` list endpoint to include an absolute timestamp alongside the relative string, or (2) add `lastCommitTimestamp` (ISO string from `%aI` git format) to the scan result. This is an API enhancement needed for Phase 2.
**Warning signs:** Grouping logic produces wrong results or fails to sort projects by recency.

### Pitfall 2: Flash of Unstyled Content (FOUC) on Theme
**What goes wrong:** Page renders in light mode, then JS runs and switches to dark mode, causing a visible flash.
**Why it happens:** React hydration and CSS application happen after initial HTML paint.
**How to avoid:** Add a synchronous `<script>` in `<head>` of `index.html` that reads localStorage and applies the `dark` class before any rendering occurs.
**Warning signs:** Brief white flash when loading a page with dark mode preference saved.

### Pitfall 3: Tailwind v4 @theme vs :root Confusion
**What goes wrong:** Colors defined in `:root` don't generate utility classes. Developer writes `bg-custom-color` and it doesn't work.
**Why it happens:** Only `@theme` generates Tailwind utilities. `:root` creates CSS variables but not utility classes.
**How to avoid:** Use `@theme` for any color/spacing/font that should become a utility class. Use `:root` only for variables that will be referenced via `var()` in custom CSS.
**Warning signs:** Tailwind classes like `bg-terracotta` not being recognized.

### Pitfall 4: Over-Fetching on Hero Selection
**What goes wrong:** Every click on a project row triggers a full API call, even if the data was just fetched.
**Why it happens:** No client-side caching of detail responses.
**How to avoid:** Cache the last N detail responses in a simple Map or object. Since project data changes slowly (5-minute scan interval), a 60-second client-side TTL is fine. Or consider simple `useRef`-based caching in the custom hook.
**Warning signs:** Visible loading state every time user clicks between projects they've already viewed.

### Pitfall 5: Mobile Layout Breaks with Long Project Names
**What goes wrong:** Long project names or branch names overflow their containers on narrow screens.
**Why it happens:** No text truncation applied, or flex layout doesn't constrain children.
**How to avoid:** Use `truncate` (Tailwind utility) on project names and branch names. Set `min-w-0` on flex children to allow text truncation.
**Warning signs:** Horizontal scroll on mobile, or layout elements pushing off-screen.

## Code Examples

Verified patterns from official sources:

### Tailwind v4 @theme with Custom Colors
```css
/* Source: https://tailwindcss.com/docs/theme */
@import "tailwindcss";

@theme {
  --color-terracotta: #d4713a;
  --color-amber-warm: #e8a04c;
  --color-surface: #faf6f1;
}

/* Usage: bg-terracotta, text-amber-warm, bg-surface */
```

### Tailwind v4 Class-Based Dark Mode
```css
/* Source: https://tailwindcss.com/docs/dark-mode */
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

/* Usage: <div class="bg-surface dark:bg-surface-dark"> */
```

### Intl.RelativeTimeFormat for Time Ago
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = date.getTime() - now;
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHours = Math.round(diffMin / 60);
  const diffDays = Math.round(diffHours / 24);

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, "second");
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, "day");
  return rtf.format(Math.round(diffDays / 30), "month");
}
// Output: "2 hours ago", "yesterday", "3 days ago", "last month"
```

### React 19 Data Fetching with Cleanup
```typescript
// Source: React docs pattern for useEffect-based fetching
// (React 19 `use()` hook requires a cached promise; for this phase,
//  useEffect + useState is simpler and avoids the caching requirement)
useEffect(() => {
  let cancelled = false;

  fetch("/api/projects")
    .then(res => res.json())
    .then(data => {
      if (!cancelled) setProjects(data.projects);
    });

  return () => { cancelled = true; };
}, []);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind v3 `tailwind.config.js` | Tailwind v4 `@theme` in CSS | v4.0, Jan 2025 | No JS config file. Design tokens defined in CSS. Full rebuilds <100ms |
| `darkMode: 'class'` in config | `@custom-variant dark` in CSS | v4.0, Jan 2025 | Dark mode variant defined in CSS, not JS config |
| PostCSS plugin for Tailwind | `@tailwindcss/vite` plugin | v4.0, Jan 2025 | Direct Vite integration, faster builds |
| `useEffect` + `useState` for data | React 19 `use()` + Suspense | React 19, Dec 2024 | Cleaner async but requires promise caching; `useEffect` still valid for simple cases |
| date-fns / moment for relative time | `Intl.RelativeTimeFormat` | All modern browsers | Zero dependency, locale-aware |

**Deprecated/outdated:**
- `tailwind.config.js` / `tailwind.config.ts`: Not needed in Tailwind v4. Do not create one.
- `@tailwind base; @tailwind components; @tailwind utilities;`: Replaced by `@import "tailwindcss";` in v4.
- `darkMode: 'class'` config option: Replaced by `@custom-variant dark` CSS directive.

## API Data Gap: Absolute Timestamps

The current `/api/projects` list endpoint returns `lastCommitTime` as a relative string from git (e.g., "2 hours ago"). Phase 2 needs an absolute timestamp to:
1. Compute activity groups (Active/Idle/Stale based on day thresholds)
2. Sort projects by recency within groups
3. Format relative times consistently on the client

**Resolution:** The project scanner already uses `git log --format=%h|%s|%ar` which produces relative time. Change to `git log --format=%h|%s|%ar|%aI` to also capture the ISO 8601 author date. Add `lastCommitDate` (ISO string) to the scan result and list endpoint response. This is a small API-side change that unblocks all dashboard grouping logic.

The detail endpoint already returns the full `commits[]` array, so the hero card can use `relativeTime` from individual commits, but adding absolute timestamps there too would enable consistent client-side formatting.

## Open Questions

1. **Hono RPC Client vs Plain Fetch**
   - What we know: `packages/web/src/api/client.ts` has a working `hc<AppType>` setup. The Phase 1 scaffold uses plain `fetch` as fallback.
   - What's unclear: The `AppType` is derived from `createApp()` which returns a bare `Hono` without route type chaining. The RPC client may not have full type inference for route responses.
   - Recommendation: Verify `hc` type inference works for `/api/projects` and `/api/projects/:slug`. If types flow correctly, use `hc` for all API calls. If not, use typed plain `fetch` with Zod schemas from `@mission-control/shared` for response validation. Either way, the API calls work -- this is a DX quality question, not a blocker.

2. **Commit Timeline ISO Timestamps**
   - What we know: Git scanner uses `%ar` (relative) format. Detail endpoint returns `relativeTime` string per commit.
   - What's unclear: Whether to parse git's relative strings on the client or add ISO timestamps to the API.
   - Recommendation: Add ISO timestamps to the API (see "API Data Gap" section above). Small scanner change, clean separation of concerns.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1+ |
| Config file | `vitest.config.ts` (root, references `packages/api/vitest.config.ts`) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Projects grouped by Active/Idle/Stale with correct thresholds | unit | `pnpm vitest run packages/web/src/__tests__/lib/grouping.test.ts` | No -- Wave 0 |
| DASH-02 | Project row renders all required fields | unit | `pnpm vitest run packages/web/src/__tests__/components/project-row.test.tsx` | No -- Wave 0 |
| DASH-03 | Hero card renders commit timeline and GSD badge | unit | `pnpm vitest run packages/web/src/__tests__/components/hero-card.test.tsx` | No -- Wave 0 |
| DASH-04 | Clicking project row updates hero selection | unit | `pnpm vitest run packages/web/src/__tests__/components/departure-board.test.tsx` | No -- Wave 0 |
| DASH-10 | Responsive layout hides metadata on mobile | manual-only | Visual inspection at <640px viewport | N/A (CSS breakpoints, not unit testable without e2e) |
| DASH-11 | Visual identity warm palette, dark/light toggle | unit | `pnpm vitest run packages/web/src/__tests__/hooks/use-theme.test.ts` | No -- Wave 0 |

### Additional Unit Tests
| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| `formatRelativeTime` produces correct strings | unit | `pnpm vitest run packages/web/src/__tests__/lib/time.test.ts` | No -- Wave 0 |
| `groupProjectsByActivity` handles edge cases (null times, boundary days) | unit | `pnpm vitest run packages/web/src/__tests__/lib/grouping.test.ts` | No -- Wave 0 |
| API scanner returns absolute timestamps (API-side) | unit | `pnpm vitest run packages/api/src/__tests__/services/project-scanner.test.ts` | Yes (exists, needs update) |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green + visual inspection of dashboard at all three breakpoints

### Wave 0 Gaps
- [ ] `packages/web/vitest.config.ts` -- web package Vitest config with jsdom environment for React component tests
- [ ] Add `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` to web package devDependencies
- [ ] Register web package config in root `vitest.config.ts` projects array
- [ ] `packages/web/src/__tests__/lib/grouping.test.ts` -- covers DASH-01
- [ ] `packages/web/src/__tests__/lib/time.test.ts` -- covers relative time formatting
- [ ] `packages/web/src/__tests__/hooks/use-theme.test.ts` -- covers DASH-11 (theme toggle behavior)
- [ ] `packages/web/src/__tests__/components/project-row.test.tsx` -- covers DASH-02
- [ ] `packages/web/src/__tests__/components/hero-card.test.tsx` -- covers DASH-03
- [ ] `packages/web/src/__tests__/components/departure-board.test.tsx` -- covers DASH-04

## Sources

### Primary (HIGH confidence)
- [Tailwind CSS v4 @theme docs](https://tailwindcss.com/docs/theme) -- theme variable syntax, namespace conventions, utility generation
- [Tailwind CSS v4 dark mode docs](https://tailwindcss.com/docs/dark-mode) -- `@custom-variant dark` syntax, class toggle, FOUC prevention
- [Tailwind CSS v4 adding custom styles](https://tailwindcss.com/docs/adding-custom-styles) -- @layer base, @theme interaction
- [MDN Intl.RelativeTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat) -- browser-native relative time formatting
- Codebase inspection -- `packages/api/src/services/project-scanner.ts`, `packages/api/src/routes/projects.ts`, `packages/web/src/App.tsx`, `packages/shared/src/schemas/project.ts`

### Secondary (MEDIUM confidence)
- [Tailwind CSS v4 responsive design docs](https://tailwindcss.com/docs/responsive-design) -- breakpoint system, mobile-first approach
- [React 19 Suspense for Data Fetching](https://www.syncfusion.com/blogs/post/react-19-suspense-for-data-fetching) -- `use()` hook patterns and caveats

### Tertiary (LOW confidence)
- None -- all findings verified against official docs or codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and verified in codebase
- Architecture: HIGH -- patterns verified against Tailwind v4 and React 19 official docs, codebase patterns established in Phase 1
- Pitfalls: HIGH -- identified from codebase inspection (timestamp format gap is concrete and verifiable)
- Theming: HIGH -- Tailwind v4 `@theme` and `@custom-variant` verified against official docs

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable stack, no fast-moving dependencies)
