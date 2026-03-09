# Feature Research

**Domain:** Personal Operating Environment / Dashboard + Universal Capture System
**Researched:** 2026-03-09
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must exist for the product to feel complete as a "personal operating environment." Without these, the daily home screen promise breaks down.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single-page dashboard overview | Every dashboard product (Notion, Linear, developer portals) provides an at-a-glance view. Without it, there's no "home screen." | MEDIUM | Departure board + hero card layout already spec'd. The real complexity is data aggregation from multiple sources (git repos, GSD state, captures). |
| Fast page load / instant feel | Linear set the bar: interactions under 50ms, real-time sync. Raycast built its brand on speed. A slow dashboard violates the core value ("smarter in 3 seconds"). | HIGH | Requires SSR or aggressive caching. Data comes from Mac Mini git repos, Convex, MCP servers. Pre-compute on server, serve static-ish snapshots with SSE for live updates. |
| Quick capture from dashboard | Notion, Obsidian, Drafts, and every note tool provide a capture field. The dashboard without a capture input is just a read-only display. | LOW | Single text field with keyboard shortcut (Cmd+K or / to focus). Submit sends to API, AI categorizes async. |
| Keyboard shortcuts / command palette | Raycast, Linear, VS Code, Arc all have this. Developer tools without keyboard navigation feel broken. 40%+ of Raycast users interact via keyboard weekly. | MEDIUM | Cmd+K command palette for: quick capture, project navigation, search. React libraries (cmdk) make this straightforward. |
| Full-text search across captures and projects | Every knowledge tool (Notion, Obsidian, Capacities) has search. Without it, captures become a write-only graveyard. | MEDIUM | SQLite FTS5 for text search. Index captures, project metadata, commit messages. BM25 ranking built into FTS5. |
| Mobile capture (iOS) | Drafts, Apple Notes, Bear all support iOS capture. Ideas happen away from the desk. The spec explicitly requires "3 taps max" widget capture. | HIGH | iOS app with widget, share sheet, voice input. Offline queue with sync. This is a full iOS development effort. |
| Offline capture resilience | Drafts works offline. Apple Notes works offline. Capture that fails when Mac Mini is unreachable means ideas get lost. The spec calls this "sacred." | MEDIUM | Local queue on iOS (Core Data/SwiftData) and CLI (local file). Sync on reconnect. Last-write-wins conflict resolution is fine for captures. |
| Project status visibility | Git status, last activity, dirty files. Developer portals (Port, OpsLevel, Backstage) all show service health. Without this, the dashboard adds no value over `git status` in terminal. | MEDIUM | Already prototyped in portfolio-dashboard MCP server. Pull git data, GSD state, compute last-activity timestamps. |
| Responsive layout (mobile-readable) | Dashboard must be glanceable on phone. Not a full mobile app -- just readable. Every modern web dashboard is responsive. | LOW | CSS grid/flexbox. Departure board rows stack vertically on mobile. Hero card becomes full-width. |
| Data persistence and reliability | Captures must never be lost. This is non-negotiable for any capture/notes product. | MEDIUM | SQLite on Mac Mini for primary storage. WAL mode for concurrent reads. Regular backups. Convex as secondary/sync layer if desired. |

### Differentiators (Competitive Advantage)

Features that make Mission Control feel like a "personal operating environment" rather than just another dashboard or notes app.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI auto-categorization of raw captures | Zero cognitive overhead at capture time. Dump raw text, voice, links -- AI figures out which project it belongs to, what type it is, and whether it's actionable. Drafts requires manual routing via "actions." Notion requires choosing a database. MC requires nothing. | HIGH | LLM call per capture (can be batched/async). Needs project context to match against. Confidence scoring so user can correct. This is the killer feature that prevents the "graveyard inbox" pattern. |
| Captures woven into project cards | Every other tool separates "inbox" from "workspace." Notion has separate databases. Linear has separate inbox. MC puts captures where they belong -- on the project card itself. This prevents the "separate inbox that becomes a graveyard" anti-pattern that killed every previous system. | MEDIUM | API design: captures linked to projects via AI-assigned or user-corrected project_id. Dashboard renders captures inline on project cards. Unlinked captures appear in a "loose thoughts" section. |
| Sprint heatmap (contribution grid) | GitHub-style visualization of serial sprint patterns across 12+ projects. No tool shows "when did I last deeply work on each project?" at a glance. Reveals work patterns, staleness, and momentum. | MEDIUM | One row per project, columns are days/weeks. Data from git commits + GSD state changes. GitHub-style green gradient. Compact but information-dense. |
| MCP server for Claude Code integration | MC exposes its own MCP server so Claude Code sessions can read/write captures, check project status, and surface open items. No personal dashboard does this. It turns MC into infrastructure for AI-assisted development. | MEDIUM | MCP server with tools: create_capture, list_captures, get_project_status, search. Claude Code sessions can push captures during work ("remind me to refactor this") and pull context ("what captures exist for this project?"). |
| Voice capture with audio preservation | Monologue transcribes but doesn't store audio. Apple Voice Memos stores but doesn't categorize. MC does both: transcribe for search, store audio for context, AI-categorize for routing. The original thought in its raw form is never lost. | HIGH | iOS: AVAudioRecorder -> Whisper/on-device transcription -> upload audio + text to API. Store audio as blobs (S3-compatible or filesystem). Link transcription to capture record. |
| "Previously on..." context restoration | No tool provides a narrative summary of "what was I doing in this project?" Developer portals show metrics; MC shows a human-readable recap. Solves the serial-sprint context-switching problem. | MEDIUM | Generated from recent commits + GSD pause summaries + captures. Could be LLM-generated narrative or structured breadcrumbs. Expandable on project card. |
| Stale project nudges with uncommitted work detection | Active intervention: projects idle 2+ weeks with dirty working directories get visual treatment. No dashboard does this. It prevents the "forgot I had uncommitted work" problem. | LOW | Git status check (already available from portfolio-dashboard MCP). Simple time-since-last-commit + dirty-file-count logic. Visual: amber/red indicator on project row. |
| AI triage for aging captures | Periodically surfaces stale captures for act/archive/dismiss. Like email triage (60% processing time reduction) but for ideas. Prevents capture graveyard without requiring daily inbox-zero discipline. | MEDIUM | Cron job / scheduled task that identifies captures older than N days without action. LLM-assisted triage suggestions. Push notification or dashboard section: "3 captures need attention." |
| Mac Mini health pulse | Ambient indicator showing Mac Mini reachability and service status. No personal tool does infrastructure monitoring as a dashboard feature. For a developer running services on a home server, this is genuinely useful. | LOW | Periodic health check (ping + service status endpoints). Green/amber/red dot on dashboard. Expandable to show individual service status (Crawl4AI, Go services, training jobs). |
| CLI capture during dev sessions | Capture ideas without leaving terminal. `mc capture "need to refactor auth module"` during a Claude Code session. Drafts has URL schemes but no CLI. This keeps developers in flow. | LOW | Simple CLI tool that POSTs to MC API. Can be a shell script or small binary. Optional: pipe support (`echo "idea" | mc capture`). |
| Share sheet capture (iOS) | See interesting article/tweet anywhere on iOS, share to MC. Gets AI-categorized and linked to relevant project. Replaces the "WhatsApp self-message" and "share to Capacities" patterns. | MEDIUM | iOS share extension. Receives URL + selected text. Queues locally, syncs to API. AI extracts metadata from URL (title, summary). |
| API-first architecture (platform, not just app) | The API is the product; dashboard is just the first client. Enables future clients, integrations, automations. Notion's API came years after the product. MC starts API-first. | MEDIUM | Clean REST API (or tRPC) behind Tailscale. OpenAPI spec. Every dashboard feature backed by an API endpoint. MCP server is just another API consumer. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem valuable but would undermine the core value proposition or add complexity without proportional benefit.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full task management / Kanban boards | "I need to track tasks too." Every productivity tool converges here. | Mission Control is awareness + capture, not project management. Building task management means competing with Linear, which is a losing battle. Every previous task system became a graveyard because of overhead. The user tracks tasks in their head -- that works. | Captures can be flagged as "actionable" by AI triage. Link out to Linear/GitHub Issues for actual task tracking. MC surfaces the signal, external tools manage the work. |
| Real-time collaborative editing | "What if someone else needs to use it?" | Single user v1. Collaborative editing is an enormous engineering investment (CRDTs, operational transforms). It solves a problem that doesn't exist yet. | API-first architecture means future users get their own clients. Shared data layer, not shared editing. |
| Email triage / unified inbox | "Since you're capturing everything, add email." | Email is a separate, massive domain. msgvault already handles email on the Go side. Adding email triage doubles the scope. | Future plugin that surfaces email signals from msgvault. MC stays focused on captures and project awareness. |
| Rich text editor / document creation | "I want to write documents in MC." | MC is a capture and awareness tool, not a writing environment. Building a rich text editor is a black hole of complexity (Notion spent years on theirs). | Plain text + markdown for captures. Link out to proper editors (Obsidian, VS Code, Bear) for long-form writing. |
| Multi-platform (Android, Windows, Linux) | "What about non-Apple devices?" | User is all-Apple ecosystem. Building cross-platform multiplies effort by 3-4x for zero current benefit. | Web dashboard is accessible from any device with a browser. API is platform-agnostic for future clients. |
| Formal plugin marketplace / third-party extensions | "Let others build plugins." | No second user exists yet. Plugin frameworks require stable APIs, documentation, versioning, security sandboxing. Premature. | Clean API boundaries and loose coupling. When a second plugin needs to be built, formalize the pattern then. Current approach: code modules with clean interfaces. |
| Graph view / knowledge visualization | "Show me connections between my notes like Obsidian." | Graph views are visually impressive but rarely useful in practice. Obsidian's graph view is the most screenshotted, least used feature. For 12 projects with captures, a graph adds noise, not signal. | Sprint heatmap provides the meaningful visualization. Project cards with inline captures show relationships contextually. Search handles discovery. |
| Notifications / push alerts for everything | "Notify me when X happens." | Notification fatigue kills adoption faster than any missing feature. Over-notification is why people abandon tools. | Minimal, high-signal notifications only: stale capture triage (periodic), Mac Mini down (urgent). Dashboard is pull-based by design -- you check it when you want to. |
| Calendar integration / scheduling | "Show my calendar on the dashboard." | Calendar is a separate concern handled by Apple Calendar. Adding it means syncing, auth, display complexity for marginal value. | Future lightweight plugin if needed. Not v1. MC is about projects and captures, not time management. |
| Auto-import from other tools | "Import my Notion/Obsidian/Capacities data." | Migration tools are high-effort, low-reuse. The user has already migrated away from these tools mentally. Starting fresh is the point. | Manual capture for anything worth preserving. The "last environment" philosophy means starting clean, not importing baggage. |

## Feature Dependencies

```
[API Server (REST/tRPC)]
    |
    +--requires--> [Data Layer (SQLite + FTS5)]
    |                   |
    |                   +--requires--> [Schema Design (captures, projects, metadata)]
    |
    +--enables--> [Web Dashboard]
    |                 |
    |                 +--requires--> [Project Data Aggregation (git, GSD, health)]
    |                 +--requires--> [Command Palette / Keyboard Shortcuts]
    |                 +--requires--> [Quick Capture Field]
    |                 +--enhances--> [Sprint Heatmap]
    |                 +--enhances--> [Hero Card + "Previously on..."]
    |                 +--enhances--> [Stale Project Nudges]
    |                 +--enhances--> [Mac Mini Health Pulse]
    |
    +--enables--> [MCP Server]
    |                 +--requires--> [API Server]
    |                 +--requires--> [Data Layer]
    |
    +--enables--> [CLI Capture Tool]
    |                 +--requires--> [API Server]
    |
    +--enables--> [iOS Companion App]
    |                 +--requires--> [API Server]
    |                 +--requires--> [Offline Queue + Sync]
    |                 +--enhances--> [Widget Capture]
    |                 +--enhances--> [Share Sheet Extension]
    |                 +--enhances--> [Voice Capture]
    |
    +--enables--> [AI Categorization Pipeline]
                      +--requires--> [Data Layer]
                      +--requires--> [LLM Integration (Claude API or local)]
                      +--enhances--> [AI Triage for Aging Captures]

[Full-Text Search]
    +--requires--> [Data Layer (FTS5 virtual tables)]
    +--enhances--> [Command Palette (search mode)]
    +--enhances--> [MCP Server (search tool)]
```

### Dependency Notes

- **Everything requires API Server + Data Layer:** These are the foundation. Nothing works without them. Must be phase 1.
- **Web Dashboard requires Project Data Aggregation:** The dashboard needs to pull from git repos, GSD state files, and Mac Mini services. This aggregation layer (partially built in portfolio-dashboard MCP) must exist before the dashboard renders meaningful data.
- **iOS App requires API Server:** Capture endpoints must be stable before building the iOS client. But offline queueing means the iOS app can be developed in parallel once API contracts are defined.
- **AI Categorization requires Data Layer + LLM:** Captures must be stored before they can be categorized. LLM integration is async and can be added after basic capture works.
- **MCP Server requires API Server:** The MCP server is a thin adapter over the same API the dashboard uses. Build after API is stable.
- **Sprint Heatmap enhances Dashboard:** Not a blocker for launch but adds significant value. Requires git commit history which is already available from portfolio-dashboard MCP.
- **Voice Capture enhances iOS App:** Can be added as a second pass on the iOS app. Requires audio storage infrastructure (blob storage or filesystem).

## MVP Definition

### Launch With (v1)

Minimum viable product that validates the core value: "Every time you open MC, you're smarter than you were 3 seconds ago."

- [ ] **API server with core endpoints** -- CRUD for captures, project list, project detail, search. The foundation everything builds on.
- [ ] **SQLite data layer with FTS5** -- Captures table, projects table, full-text search index. Single-file database on Mac Mini.
- [ ] **Project data aggregation** -- Pull git status, recent commits, GSD state from local repos and portfolio-dashboard MCP. Cache/precompute for fast reads.
- [ ] **Web dashboard with departure board layout** -- Single page showing all projects grouped by Active/Idle/Stale. Hero card for most recent project. Fast load.
- [ ] **Quick capture on dashboard** -- Text field + keyboard shortcut. Submit capture, see it appear on relevant project card.
- [ ] **Command palette** -- Cmd+K for navigation, capture, and search. Core interaction pattern for keyboard users.
- [ ] **Basic AI categorization** -- LLM call to assign captures to projects. Async processing. User can correct.
- [ ] **CLI capture tool** -- `mc capture "thought"` from terminal. Minimal viable script that POSTs to API.
- [ ] **Mac Mini health pulse** -- Simple ping/status indicator on dashboard.

### Add After Validation (v1.x)

Features to add once the core dashboard + capture loop is working daily.

- [ ] **Full-text search with ranking** -- Trigger: captures accumulate, need to find old ones. FTS5 infrastructure is in v1 but search UI may be minimal initially.
- [ ] **Sprint heatmap** -- Trigger: dashboard is used daily, want to visualize work patterns. Add once project data aggregation is solid.
- [ ] **"Previously on..." context restoration** -- Trigger: serial sprint switching happens, need context recovery. Requires enough commit/GSD history to generate meaningful narratives.
- [ ] **Stale project nudges** -- Trigger: projects sit idle, visual treatment needed. Simple logic on top of existing git data.
- [ ] **AI triage for aging captures** -- Trigger: captures older than 2 weeks accumulate. Scheduled job that surfaces stale items.
- [ ] **MCP server for Claude Code** -- Trigger: daily dashboard use makes capture/status data valuable in Claude Code sessions. Thin wrapper over API.
- [ ] **SSE real-time updates** -- Trigger: wanting dashboard to update without refresh. SSE is simpler than WebSockets, sufficient for one-way push.

### Future Consideration (v2+)

Features to defer until the daily habit is established.

- [ ] **iOS companion app** -- Trigger: capture habit is established on web/CLI, mobile capture friction becomes the bottleneck. Full iOS development effort with widget, share sheet, offline queue.
- [ ] **Voice capture with audio storage** -- Trigger: iOS app exists, voice becomes the desired input method. Requires audio infrastructure.
- [ ] **Share sheet extension** -- Trigger: iOS app exists, "share interesting things from other apps" pattern emerges.
- [ ] **Captures from MCP servers** -- Trigger: other MCP data sources (mac-mini-bridge) have signals worth surfacing on dashboard.
- [ ] **Plugin architecture formalization** -- Trigger: second plugin needs to be built. Formalize the pattern that emerges from building the first few integrations.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| API server + data layer | HIGH | MEDIUM | P1 |
| Web dashboard (departure board) | HIGH | MEDIUM | P1 |
| Quick capture on dashboard | HIGH | LOW | P1 |
| Command palette / keyboard shortcuts | HIGH | LOW | P1 |
| Basic AI categorization | HIGH | MEDIUM | P1 |
| CLI capture tool | MEDIUM | LOW | P1 |
| Project data aggregation | HIGH | MEDIUM | P1 |
| Mac Mini health pulse | MEDIUM | LOW | P1 |
| Full-text search UI | HIGH | LOW | P2 |
| Sprint heatmap | MEDIUM | MEDIUM | P2 |
| "Previously on..." recaps | MEDIUM | MEDIUM | P2 |
| Stale project nudges | MEDIUM | LOW | P2 |
| AI triage for aging captures | MEDIUM | MEDIUM | P2 |
| MCP server for Claude Code | MEDIUM | MEDIUM | P2 |
| SSE real-time updates | MEDIUM | MEDIUM | P2 |
| iOS companion app | HIGH | HIGH | P3 |
| Voice capture + audio storage | MEDIUM | HIGH | P3 |
| iOS share sheet extension | MEDIUM | MEDIUM | P3 |
| Plugin architecture | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch -- validates the "smarter in 3 seconds" promise
- P2: Should have, add when core loop is working daily
- P3: Future consideration, defer until daily habit established

## Competitor Feature Analysis

| Feature | Notion | Linear | Raycast | Drafts | Obsidian | Capacities | MC Approach |
|---------|--------|--------|---------|--------|----------|------------|-------------|
| Dashboard overview | Database views, customizable | Project boards, cycles | N/A (launcher) | N/A (text-first) | Daily note + graph | Timeline + spaces | Departure board: dense, opinionated, single-page |
| Quick capture | Cmd+N new page (requires choosing location) | Cmd+Shift+C quick issue | Floating notes, snippets | Opens instantly to blank text | Quick switcher to daily note | Quick capture button | Dashboard text field + Cmd+K + CLI + iOS widget |
| AI categorization | Notion AI (writing assist, not auto-categorize) | Auto-assign via rules | AI chat (not categorization) | No AI categorization | Community plugins | AI assistant for questions | Auto-categorize to project, confidence score, user correction |
| Search | Full-text across workspace | Full-text + filters | File search + snippets | Full-text in drafts | Full-text + backlinks | Full-text + object properties | FTS5 across captures + project metadata + commits |
| Mobile capture | iOS app (full client) | iOS app (full client) | No mobile | iOS app (instant capture) | iOS app (full vault) | iOS app | iOS widget (3 taps), share sheet, voice |
| Offline support | Limited (recent pages cached) | Limited | N/A (local) | Full offline | Full offline (local files) | Desktop + mobile offline | Offline capture queue, sync on reconnect |
| Extension/plugin system | Connections, API | API + webhooks | 1500+ extensions, React/TS | Actions, scripts | 1000+ community plugins | Limited integrations | MCP server + clean API. Formalize plugins later. |
| Real-time updates | Real-time collab | Real-time sync (<50ms) | N/A | iCloud sync | Sync plugin | Cross-device sync | SSE for dashboard updates. Not collab -- single user. |
| Voice input | No native voice | No native voice | No native voice | Dictation support | No native voice | No native voice | Voice capture with transcription AND audio storage |
| Git/code integration | None | GitHub/GitLab bidirectional | Git commands via extensions | None | Git plugin | None | Native: git status, commits, GSD state on every project card |
| AI triage/maintenance | AI page summaries | Auto-close stale issues | AI chat | No AI triage | No built-in | AI assistant | Periodic AI triage of aging captures: act/archive/dismiss |

## Key Insights from Competitor Analysis

1. **No product combines project awareness + capture + AI categorization.** Notion does workspaces. Linear does project management. Drafts does capture. MC uniquely combines all three for a single developer's workflow.

2. **The "capture graveyard" is universal.** Every tool the user has tried was abandoned because captures pile up without being processed. AI triage is the direct counter to this -- the system actively prevents graveyard formation.

3. **Speed is non-negotiable.** Linear's <50ms interactions and Raycast's instant launch set the expectation. A dashboard that takes 2+ seconds to load will not become a daily habit.

4. **Git-native project awareness doesn't exist in productivity tools.** Developer portals (Port, OpsLevel) do this for teams/services but not for a personal multi-project workflow. This is a genuine gap.

5. **Offline capture is standard but offline-first architecture is rare.** Most tools have "limited offline" -- MC's approach of treating offline as a first-class capture path (queue + sync) is a meaningful differentiator for the iOS client.

6. **MCP integration is the 2025-2026 frontier.** With 97M+ monthly SDK downloads and adoption across major AI tools, MCP is the right integration pattern. No personal dashboard exposes MCP. This turns MC into AI infrastructure, not just a dashboard.

## Sources

- [Linear Review (2026)](https://www.siit.io/tools/trending/linear-app-review) -- Features, pricing, developer experience
- [Raycast Review (2026)](https://efficient.app/apps/raycast) -- Extension ecosystem, AI features, keyboard-first design
- [Notion vs Obsidian (2026)](https://productive.io/blog/notion-vs-obsidian/) -- Feature comparison, AI capabilities
- [Capacities Journey (2026)](https://www.fahimai.com/capacities-review) -- Object-based knowledge management
- [Arc Browser Design](https://medium.com/design-bootcamp/arc-browser-rethinking-the-web-through-a-designers-lens-f3922ef2133e) -- Sidebar, spaces, visual identity
- [Monologue Voice Dictation](https://every.to/on-every/introducing-monologue-effortless-voice-dictation) -- Voice capture, AI cleanup, context awareness
- [Drafts App](https://getdrafts.com/) -- Quick capture, actions, automation
- [SSE vs WebSockets (2025)](https://dev.to/haraf/server-sent-events-sse-vs-websockets-vs-long-polling-whats-best-in-2025-5ep8) -- Real-time update patterns
- [SQLite FTS5 Extension](https://sqlite.org/fts5.html) -- Full-text search implementation
- [MCP Specification (2025-11)](https://modelcontextprotocol.io/specification/2025-11-25) -- Protocol features, adoption stats
- [Offline-First Architecture (2025)](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) -- Sync patterns, local storage
- [Internal Developer Portal Homepage](https://www.port.io/blog/internal-developer-portal-homepage) -- Developer portal design patterns
- [AI Email Triage Automation](https://aimaker.substack.com/p/build-ai-email-triage-agent-automation-make-tutorial) -- AI categorization and triage patterns
- [Command Palette UI Design](https://mobbin.com/glossary/command-palette) -- Command palette best practices

---
*Feature research for: Mission Control Personal Operating Environment*
*Researched: 2026-03-09*
