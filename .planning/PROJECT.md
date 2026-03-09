# Mission Control

## What This Is

Mission Control is a personal operating environment — an API-first platform with a web dashboard that serves as the daily home screen for managing projects, capturing ideas, and maintaining awareness across a multi-project, multi-node development ecosystem. It runs on a Mac Mini, accessed via Tailscale, and is designed to be the last environment ever built: a foundation that evolves through plugins rather than being replaced.

The API and data layer are the core product — a shared "playground" infrastructure. The web dashboard is the first client (the first "lightsaber"), purpose-built for one person's brain. Future users build their own clients on the same platform, personalized to their own workflows and tics.

## Core Value

**Every time you open Mission Control, you're smarter than you were 3 seconds ago.** Instant value — you see what changed, what you captured, what you forgot, and what finished while you were away. No warm-up, no navigation, no obligation.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Portfolio Dashboard:**
- [ ] Single-page web dashboard showing all 12+ projects at a glance
- [ ] Departure board layout: dense table grouped by Active/Idle/Stale with hero card for most recent project
- [ ] Project cards show: name, one-liner tagline, host badge, branch, last activity, dirty file indicator, GSD state
- [ ] Hero card shows: last 3-5 commits as mini-timeline, GSD pause summary, "last context" narrative
- [ ] Sprint heatmap: GitHub-style contribution grid, one row per project, showing serial sprint pattern
- [ ] Mac Mini health pulse: ambient indicator showing reachability and service status
- [ ] Stale project nudges: projects idle 2+ weeks with uncommitted work get subtle visual treatment
- [ ] "Previously on..." expandable commit breadcrumbs per project row

**Universal Capture System:**
- [ ] Zero-friction capture from multiple entry points: iOS widget, share sheet, voice, CLI, browser
- [ ] Raw dump input — user throws in unstructured text, links, voice; AI categorizes and links to projects
- [ ] Voice capture with transcription AND audio storage
- [ ] iOS share sheet extension: see interesting thing anywhere, share to MC
- [ ] CLI capture command for use during Claude Code sessions
- [ ] Browser quick-capture field on MC dashboard
- [ ] Captures woven into project cards on dashboard — not a separate inbox
- [ ] AI triage for aging captures: periodically surfaces stale captures for act/archive/dismiss
- [ ] Capture must survive Mac Mini offline — local queueing with sync on iOS/CLI clients

**API Platform:**
- [ ] API-first architecture: dashboard, iOS app, CLI are all clients to the same API
- [ ] Clean, well-designed API behind Tailscale — private but built like a product
- [ ] MCP server exposing MC data to Claude Code sessions (read/write captures, project status, open captures)
- [ ] Consumes existing MCP servers: portfolio-dashboard, mac-mini-bridge
- [ ] AI-powered natural language search across all captures and project state

**iOS Companion (Super-App Shell):**
- [ ] iOS app serving as capture client: widget (3 taps max), share sheet, voice input
- [ ] Read-only dashboard view for glancing at project status from phone
- [ ] Designed as a super-app container that can eventually load mini-app modules
- [ ] Offline capture queueing with sync when reconnected

### Out of Scope

- **Communications / messaging** — QMspace handles comms. MC gets a lightweight QMspace chat plugin eventually, not built-in messaging.
- **Email triage** — Interesting future capability but not v1. MC captures, it doesn't replace email clients yet.
- **Operations / command execution** — Running commands, triggering builds, service management. Foundation supports it but v1 is awareness + capture, not action.
- **Full orchestration** — Autonomous research, doc generation, AI agent management. Future evolution, not v1.
- **Multi-user auth** — Single user for v1. Trust-based access. No auth engineering until there's a real second user.
- **iOS super-app module loading** — The shell is built, but loading other mini-apps inside it is a future milestone.
- **Formal plugin framework** — v1 uses loose coupling with clean boundaries. Plugin system formalized when there's a second plugin to build.
- **Principal's Ear integration** — PE has its own product/commercial trajectory. Shared capture patterns, not shared code.

## Context

**Origin:** Emerged from a brainstorming session while building a portfolio-dashboard MCP server. The dashboard concept expanded into a full personal operating environment when the user declared: "I want to build my last new environment."

**Design philosophy:** "Last environment" — every previous project environment was built from scratch and eventually abandoned. MC is designed to evolve through plugin architecture rather than be replaced. The foundation must be right because it's permanent.

**Existing ecosystem:**
- `portfolio-dashboard/` — MCP server providing git status, commit history, GSD state, sprint patterns across all projects. Becomes a data source MC consumes.
- `mission-control/` — Existing codebase with CF Worker, Hub, Compute nodes, Convex DB, Swift apps. **Clean slate** — existing code is abandoned, git history tells the story.
- `qmspace/` — Separate comms platform. Stays independent, gets a lightweight chat plugin in MC eventually.
- Mac Mini hosts: Go services (msgvault, pixvault, rss_rawdata), Docker (Crawl4AI), training jobs.
- `principals-ear/` — iPhone capture + extraction pipeline. Separate product with potential commercial client. Shares DNA with MC capture, not code.

**The "company as a codebase" vision:** The infrastructure (APIs, data layer, Mac Mini) is a shared playground. Each person builds their own personalized client/tools on top of it. You can't assign someone their obsession — you provide access and foster curiosity. The platform enables others to build their own lightsabers.

**User patterns that inform design:**
- Works in serial sprints — intense focus on one project for days/weeks, then moves on
- Ideas captured via whatever has least friction (WhatsApp share to Capacities, Monologue voice app) — tools adopted for entry point, not features
- Every previous task/capture system abandoned due to: too much friction, becomes a graveyard, doesn't fit flow, over-structured
- Morning pattern: "what finished while I was sleeping?" — checks on async jobs and long-running processes
- Currently tracks tasks in head — things get forgotten, brain noodles that sparked projects get lost

**Dashboard design (from brainstorm session):**
- Departure board + hero card (Approach A from research)
- Visual identity: Arc browser energy — opinionated, distinctive, not afraid to be different. Not dark-mode-by-default, not sterile white.
- Hybrid interaction: keyboard shortcuts for quick-capture (Spotlight energy), mouse/visual for browsing dashboard
- All six enrichments selected: sprint heatmap, uncommitted work badge, "previously on..." recaps, Mac Mini health pulse, stale project nudges, project one-liner taglines

## Constraints

- **Hosting:** Mac Mini via Tailscale. Private, always-on, close to data sources.
- **Tech stack:** Deferred to research phase. No premature lock-in.
- **Data storage:** Deferred to research. Must support: captures with audio, project state, async job status, full-text + AI search.
- **Clean slate:** Existing mission-control code is abandoned. New architecture from scratch in the same repo.
- **Single user v1:** No auth, no multi-tenant. But API design must not preclude multi-user future.
- **Offline capture:** iOS and CLI capture paths must work when Mac Mini is unreachable. Local queue + sync.
- **MCP dual role:** MC consumes MCP servers (portfolio-dashboard, mac-mini-bridge) AND exposes its own MCP server for Claude Code integration.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| API-first architecture | The API is the playground. Dashboard, iOS, CLI, future clients are all consumers. Enables "everyone builds their own lightsaber." | — Pending |
| Clean slate on existing code | Previous code served a different vision (AI gateway). New vision requires fresh architecture. Git history preserved. | — Pending |
| MCP for data, code modules for UI | MCP servers provide backend data (already have portfolio-dashboard). UI customization via code modules. Formalize plugin system later. | — Pending |
| Captures woven into project cards | Prevents the "separate inbox becomes graveyard" pattern. Captures live where they belong. | — Pending |
| AI categorization of raw captures | Zero cognitive overhead at capture time. Dump raw thought, AI figures out project association. | — Pending |
| Super-app shell for iOS | Future-proofs the iOS client for module loading. v1 is just capture + read-only dashboard. | — Pending |
| Mac Mini hosting | Private, always-on, close to data (Go services, git repos, Docker). Accessed via Tailscale. | — Pending |
| Capture must survive offline | Architectural constraint: iOS/CLI queue locally, sync when reconnected. Capture path is sacred. | — Pending |
| No auth in v1 | Single user, trust-based. Don't over-engineer. Figure out auth when Bella needs access. | — Pending |
| Arc browser design energy | Opinionated, distinctive, breaks conventions. Not another dark-mode developer dashboard. | — Pending |

---
*Last updated: 2026-03-09 after initialization*
