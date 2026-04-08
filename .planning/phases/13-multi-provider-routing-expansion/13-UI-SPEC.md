---
phase: 13
slug: multi-provider-routing-expansion
status: draft
shadcn_initialized: false
preset: none
created: 2026-04-08
---

# Phase 13 — UI Design Contract

> Visual and interaction contract for multi-provider routing expansion. Primarily backend phase with three UI surface areas: routing attribution, task classification display, and boundary discovery results.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Tailwind v4 CSS-first) |
| Preset | not applicable |
| Component library | none (custom components) |
| Icon library | none (inline SVG, existing pattern) |
| Font | General Sans (display), Geist (body/ui), JetBrains Mono (code) |

**Note:** All design tokens already defined in `packages/web/src/app.css` via `@theme`. This phase adds no new tokens -- all UI elements use existing palette.

---

## Spacing Scale

Declared values (inherited from DESIGN.md, no changes):

| Token | Value | Usage |
|-------|-------|-------|
| 2xs | 2px | Hairline gaps |
| xs | 4px | Icon gaps, inline padding |
| sm | 8px | Compact element spacing |
| md | 16px | Default element spacing |
| lg | 24px | Section padding |
| xl | 32px | Layout gaps |
| 2xl | 48px | Major section breaks |
| 3xl | 64px | Page-level spacing |

Exceptions: none

---

## Typography

Inherited from DESIGN.md. Phase 13 UI surfaces use only these roles:

| Role | Size | Weight | Line Height | Font |
|------|------|--------|-------------|------|
| Body | 15px | 400 | 1.6 | Geist |
| Small | 13px | 400 | 1.5 | Geist |
| Caption | 12px | 500 | 1.4 | Geist |
| Mono label | 11px | 500 | 1.4 | JetBrains Mono, uppercase, 0.06em tracking |

No display or heading typography needed -- Phase 13 adds inline metadata, not new pages or sections.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#0B0D11` | Background, page surface |
| Secondary (30%) | `#13161C` | Routing attribution card, capability matrix cells |
| Accent (10%) | `#C6FF3B` | Active/selected provider indicator, best-match model highlight |
| Destructive | not applicable | No destructive actions in this phase |

### Provider Identity Colors (new for Phase 13)

Each provider gets a distinct color for routing attribution UI. Drawn from existing palette where possible:

| Provider | Color | Source | Rationale |
|----------|-------|--------|-----------|
| Claude | `#FF8B3E` | existing `--color-stage-ceo` | Warm amber -- Anthropic's orange identity |
| GPT-Codex | `#36C9FF` | existing `--color-stage-eng` | Cyan -- OpenAI blue family |
| Gemini | `#B084FF` | existing `--color-stage-design` | Violet -- Google purple family |
| Local (Mac Mini) | `#2EDB87` | existing `--color-stage-qa` | Green -- local/self-hosted = organic |

These reuse existing stage identity colors to avoid palette bloat. They appear ONLY in routing attribution contexts (model badges, capability matrix headers), never as general-purpose colors.

### Task Classification Colors

Task types use text-muted (`#8B95A7`) labels with provider color dot indicators. No new colors needed.

Accent reserved for: selected provider in routing rationale, best-performing model cell in capability matrix, active routing rule highlight.

---

## Component Inventory

### 1. RoutingBadge (inline metadata)

**Where:** Appears in session message stream (Phase 12 builds the stream; Phase 13 adds this metadata).

**What it shows:**
- Provider icon (4px colored dot) + model name in mono label style
- Example: `[green dot] qwen3.5-35b-a3b` or `[amber dot] claude-opus-4-6`

**Interaction:** Click/hover expands to RoutingRationale tooltip.

**Spec:**
- Height: 24px (sm vertical padding + caption text)
- Background: `#13161C` (surface)
- Border: `#2A2F3A` 1px
- Border radius: `--radius-full` (pill shape)
- Padding: 4px 8px
- Text: 11px JetBrains Mono 500, uppercase, 0.06em tracking
- Provider dot: 6px circle, provider identity color, 4px left margin
- Hover: background `#1A1D24`, border `#3D4350`

### 2. RoutingRationale (expandable tooltip/popover)

**Where:** Expands from RoutingBadge on click.

**What it shows:**
- Task classification label (e.g., "scaffolding", "ideation", "review", "debugging")
- Routing reason (e.g., "Skill manifest declared: frontier tier" or "Heuristic: short message, no tools, low complexity -> local")
- Alternative models considered (list with provider dots)
- Confidence indicator: one of "manifest" (deterministic) or "heuristic" (inferred)

**Spec:**
- Width: 280px
- Background: `#13161C`
- Border: `#2A2F3A` 1px
- Border radius: `--radius-md` (8px)
- Padding: 16px
- Shadow: `0 4px 12px rgba(0, 0, 0, 0.4)`
- Section labels: 12px Geist 500, `#8B95A7`
- Values: 13px Geist 400, `#EDEDED`
- Task classification: 11px JetBrains Mono 500, uppercase, 0.06em tracking, `#C6FF3B` when manifest-declared, `#8B95A7` when heuristic
- Animation: fade in 150ms ease-out, translateY(-4px) to translateY(0)

### 3. CapabilityMatrix (boundary discovery results)

**Where:** Settings or diagnostics view (not in main session flow). Accessed from sidebar or admin route.

**What it shows:**
- Rows: task types (ideation, scaffolding, review, debugging, code generation, refactoring)
- Columns: models (Claude Opus, GPT-5.4, Gemini Flash, Qwen3.5-35B, Gemma 4 26B)
- Cells: quality score (0-100) with background intensity mapped to score
- Column headers: provider identity color dot + model name
- Row headers: task type label

**Spec:**
- Table layout, no horizontal scroll at 1024px+ (6 columns fit)
- Cell size: 64px width minimum, 40px height
- Cell background: provider color at opacity mapped to score (score/100 * 0.15 max opacity)
- Cell text: 15px Geist 400 tabular-nums, `#EDEDED`
- Score >= 80: cell text `#2EDB87` (pass green)
- Score 50-79: cell text `#FFB020` (flag amber)
- Score < 50: cell text `#FF5A67` (block red)
- Header row: `#13161C` background, 12px Geist 500, `#8B95A7`
- Row headers: 13px Geist 400, `#EDEDED`, left-aligned, 120px width
- Border: `#2A2F3A` 1px between cells
- Empty cell (not yet benchmarked): `--` in `#6F7C90`, no background tint
- Table border radius: `--radius-lg` (12px) on outer container

### 4. LocalModelStatus (Mac Mini connection indicator)

**Where:** Sidebar or status bar area.

**What it shows:**
- Connection status: connected / disconnected / loading model
- Active model name when connected
- Inference speed (tokens/sec) when active

**Spec:**
- Inline element, fits in sidebar
- Connected: 6px green dot (`#2EDB87`) + "Local" label in 13px Geist 400
- Disconnected: 6px red dot (`#FF5A67`) + "Local offline" in 13px Geist 400, `#8B95A7`
- Loading: 6px cyan dot (`#36C9FF`) with pulse-glow animation + "Loading model..." in 13px Geist 400, `#8B95A7`
- Hover: shows model name + tokens/sec in tooltip (same style as RoutingRationale but 200px wide)

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | not applicable (no user-facing actions -- routing is automatic per D-04) |
| Empty state heading (CapabilityMatrix) | No benchmark data yet |
| Empty state body (CapabilityMatrix) | Run the eval suite to discover model capabilities across task types. |
| Empty state heading (RoutingBadge) | not applicable (badge only appears when routing occurred) |
| Error state (local model offline) | Mac Mini unreachable -- tasks will route to cloud providers. Check Tailscale connection. |
| Error state (provider API failure) | {Provider} unavailable -- routed to {fallback}. Original error: {message} |
| Destructive confirmation | not applicable (no destructive actions in this phase) |
| Task classification labels | ideation, scaffolding, review, debugging, code-gen, refactor |
| Routing confidence labels | manifest (from skill declaration), heuristic (inferred from task characteristics) |

---

## Interaction Contract

### Routing Attribution (RoutingBadge + RoutingRationale)

1. Every AI response in the session stream includes a RoutingBadge showing which model handled it
2. Click RoutingBadge to expand RoutingRationale popover
3. Click outside or press Escape to dismiss
4. RoutingRationale is read-only -- user cannot override routing (per D-04: "user never selects a model")

### Capability Matrix

1. Matrix is view-only -- populated by eval suite results (D-12, D-13)
2. No inline editing, no re-run triggers from UI
3. Cells update when new eval results are ingested (query invalidation via react-query)
4. Sort by column: click column header to sort rows by that model's scores (descending)

### Local Model Status

1. Status indicator updates via SSE (existing streaming pattern)
2. No user interaction beyond hover-for-details
3. When local model is offline, routing silently falls back to cloud (no modal, no blocking)

---

## States Matrix

| Component | Loading | Empty | Populated | Error |
|-----------|---------|-------|-----------|-------|
| RoutingBadge | Skeleton pill (48px wide, 24px tall) | n/a | Provider dot + model name | Fallback badge: "routed to {fallback}" in warning amber |
| RoutingRationale | n/a (only appears on click) | n/a | Full rationale display | Shows original target + fallback reason |
| CapabilityMatrix | Skeleton table (6 cols x 6 rows) | "No benchmark data yet" empty state | Colored score cells | "Eval data unavailable" with retry suggestion |
| LocalModelStatus | Cyan pulsing dot + "Connecting..." | n/a (always shows status) | Green dot + "Local" | Red dot + "Local offline" |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable |
| Third-party | none | not applicable |

No component registries used. All components are custom, following existing codebase patterns.

---

## New CSS Tokens

No new CSS custom properties needed. All colors reuse existing `@theme` values from `app.css`. Provider identity colors are mapped from existing stage identity colors at the component level, not as new theme tokens.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
