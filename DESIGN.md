# Design System — gstackapp

## Product Context
- **What this is:** Cognitive code review platform for GitHub PRs. Five AI review stages run as a pipeline on every PR, visualized in a dashboard with quality trends and cross-repo intelligence.
- **Who it's for:** YC/gstack builder community (developers, not enterprise). People who ship daily and care about code quality.
- **Space/industry:** Developer tools, CI/CD quality, code review. Peers: CodeRabbit, Qodo, Graphite, Buildkite.
- **Project type:** Web app (dashboard + GitHub integration). Desktop-only Phase 1 (1024px min), dark mode only.

## Aesthetic Direction
- **Direction:** Industrial Precision
- **Decoration level:** Intentional — subtle glow effects on active pipeline nodes, flat tonal surfaces elsewhere. No gradients, no blobs, no background imagery.
- **Mood:** Operations room where you watch five different expert brains judge your code. Dense, functional, alive. Not a marketing dashboard, not a report viewer, not a checklist.
- **Visual thesis:** "Midnight operations room — matte carbon surfaces, forensic typography, high-voltage signal accents."
- **Reference sites:** linear.app (understated premium), buildkite.com (terminal-first bold), railway.com (atmospheric depth)

## Typography
- **Display/Hero:** General Sans Semibold — tight geometric grotesk with more character than Inter at display sizes. Authority without corporate stiffness. Use at -0.02em letter-spacing.
- **Body/UI:** Geist — purpose-built for developer interfaces. Clean reading at body sizes, excellent tabular number support for data-heavy screens.
- **UI/Labels:** Geist (same as body)
- **Data/Tables:** Geist with `font-variant-numeric: tabular-nums` — numbers align in columns, essential for quality scores, deltas, and trend data.
- **Code:** JetBrains Mono — proven standard in the builder community, ligature support, great at small sizes.
- **Loading:** General Sans via Bunny Fonts CDN (`fonts.bunny.net`), Geist via jsDelivr CDN, JetBrains Mono via Bunny Fonts.
- **Scale:**
  - Display 1: 56px/1.08 General Sans 700
  - Display 2: 32px/1.2 General Sans 600
  - Heading: 24px/1.2 General Sans 600
  - Subheading: 18px/1.4 Geist 500
  - Body: 15px/1.6 Geist 400
  - Small: 13px/1.5 Geist 400
  - Caption: 12px/1.4 Geist 500
  - Mono label: 11px/1.4 JetBrains Mono 500, uppercase, 0.06em tracking
  - Code: 14px/1.7 JetBrains Mono 400

## Color
- **Approach:** Restrained base palette with electric accent. Stage identity colors used contextually in pipeline views only.
- **Background:** `#0B0D11` — cool-tinted dark, slight blue undertone. Operations-room depth, not turned-off-screen black.
- **Surface:** `#13161C` — cards, panels, raised elements
- **Surface Hover:** `#1A1D24` — interactive hover state
- **Border:** `#2A2F3A` — subtle, visible but quiet
- **Border Focus:** `#3D4350` — selected/focused elements
- **Text Primary:** `#EDEDED` — high contrast, slightly warm off-white
- **Text Muted:** `#8B95A7` — metadata, timestamps, secondary labels
- **Accent:** `#C6FF3B` — electric lime. Nobody in the dev tools space uses this. Reads as "high voltage signal." Used for primary actions, links, selected states, active indicators.
- **Accent Hover:** `#D4FF6A`
- **Accent Muted:** `rgba(198, 255, 59, 0.12)` — subtle backgrounds for accent-tinted elements
- **Accent Dim:** `rgba(198, 255, 59, 0.06)` — barely-there accent wash

### Stage Identity Colors (Pipeline View only)
Each cognitive stage has a spectral identity color. These appear as top-edge accents on stage cards, glow halos around active nodes, and connecting traces. They are NOT used as general-purpose colors outside the pipeline context.

| Stage | Hex | Rationale |
|-------|-----|-----------|
| CEO Review | `#FF8B3E` | Warm amber — challenges, strategic heat |
| Eng Review | `#36C9FF` | Cyan — structural, systematic, precise |
| Design Review | `#B084FF` | Soft violet — aesthetic, perceptual |
| QA | `#2EDB87` | Electric green — alive, testing, pass/fail |
| Security | `#FF5A67` | Coral red — threat-aware, urgency |

### Status Verdict Colors (Universal)
Used everywhere verdicts appear: badges, table cells, alerts, pipeline stages.

| Status | Hex | Usage |
|--------|-----|-------|
| PASS | `#2EDB87` | All checks passed, safe to merge |
| FLAG | `#FFB020` | Issues found, human judgment needed |
| BLOCK | `#FF5A67` | Merge-blocking issues detected |
| SKIP | `#6F7C90` | Stage skipped (error, timeout, config) |
| RUNNING | `#36C9FF` | Stage currently executing |

### Semantic Alert Colors
- Success: `rgba(46, 219, 135, 0.08)` bg, `rgba(46, 219, 135, 0.2)` border, `#2EDB87` text
- Warning: `rgba(255, 176, 32, 0.08)` bg, `rgba(255, 176, 32, 0.2)` border, `#FFB020` text
- Error: `rgba(255, 90, 103, 0.08)` bg, `rgba(255, 90, 103, 0.2)` border, `#FF5A67` text
- Info: `rgba(54, 201, 255, 0.08)` bg, `rgba(54, 201, 255, 0.2)` border, `#36C9FF` text

### Cross-Repo Intelligence
- Insight highlight: `#FFD166` — warm gold for "Seen in your other repos" callouts

- **Dark mode:** This IS dark mode. Phase 1 is dark-only. Light mode deferred to Phase 2.

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — data-readable without being cramped
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)

## Layout
- **Approach:** Grid-disciplined — strict 12-column grid, left-anchored content
- **Grid:** 12 columns at min-width 1024px. Persistent left sidebar (200-240px).
- **Max content width:** 1280px
- **Border radius:** sm: 4px (badges, small elements), md: 8px (cards, inputs, buttons), lg: 12px (panels, modals), full: 9999px (pills, tags)
- **Key layout rules:**
  - Pipeline View takes 60%+ of viewport height. It IS the product. Don't shrink it for metrics.
  - Content is left-anchored and directional. Nothing centered in the main app.
  - Bottom intelligence strip for trends and cross-repo alerts (always visible, no scroll).

## Motion
- **Approach:** Intentional — animations serve comprehension and feedback, never decoration
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms) long(400-700ms)
- **Signature animations:**
  - **Dim-to-bright reveal:** Stage completion animates from 20% opacity to 100% over 400ms ease. The verdict appears to "materialize."
  - **Running pulse:** Active stage glows with a 2s ease-in-out infinite pulse (box-shadow).
  - **Pipeline trace:** Signal flows along connector lines between stages (linear, 2.5s loop). Shows data flowing through the cognitive pipeline.
- **Anti-patterns:** No scroll-driven animation, no bounce, no parallax, no decorative motion.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-30 | Initial design system created | Created by /design-consultation with competitive research (Linear, CodeRabbit, Railway, Vercel, Buildkite) + Codex outside voice + Claude subagent outside voice |
| 2026-03-30 | Electric lime accent (#C6FF3B) | Codex proposed, all voices agreed on differentiation from blue/purple. No dev tool uses lime. Reads as "high voltage signal." |
| 2026-03-30 | General Sans over Inter | Inter is the most overused font in dev tools. General Sans has more character at display sizes while remaining professional. |
| 2026-03-30 | Per-stage spectral identity | Claude subagent proposed. Each cognitive mode gets a color frequency in the pipeline view. Makes the pipeline read as five thinking modes, not five checkboxes. |
| 2026-03-30 | Cool-tinted dark (#0B0D11) over pure black | All three voices proposed tinted darks. Cool blue undertone adds depth, creates operations-room feel, complements lime accent. |
| 2026-03-30 | Left-anchored, directional layout | All three voices agreed: no centered heroes. Pipeline flows left-to-right. Content anchors left. Matches how developers read (left-to-right, top-to-bottom). |
| 2026-03-30 | Continuous pipeline rail, not bento grid | Unanimous across all voices. The hero screen is a topology, not a card grid. Stages are connected flow nodes, not standalone cards. |
