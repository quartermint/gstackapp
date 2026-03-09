# Domain Pitfalls

**Domain:** Personal operating environment / developer dashboard / universal capture system
**Researched:** 2026-03-09
**Confidence:** HIGH (pattern validated across 10+ sources, user's own history of 10+ abandoned systems)

---

## Critical Pitfalls

Mistakes that cause rewrites, abandonment, or a system that goes unused. These are ordered by likelihood of killing this specific project.

---

### Pitfall 1: The Graveyard Inbox — Captures Go In, Nothing Comes Out

**What goes wrong:** The capture system works perfectly — you can dump thoughts from anywhere with zero friction. But the processing side (organize, distill, act) never keeps up. Within weeks, the capture inbox becomes a landfill of 200+ items nobody revisits. The system starts feeling like a guilt machine. You stop capturing because "what's the point, I never look at them anyway."

**Why it happens:** Capture is the easy, dopamine-hit part of the system. Processing requires discipline, time, and cognitive overhead that competes with actual project work. Every previous PKM system the user has abandoned followed this exact arc: excited capture phase, mounting inbox, guilt, abandonment.

**Consequences:** The capture system becomes psychologically toxic. Opening it triggers anxiety rather than value. The user routes around it (back to WhatsApp, mental notes) and the system dies.

**Prevention:**
- Captures must have a maximum lifespan. After N days unprocessed, AI auto-triages: archive, surface once more, or dismiss. The inbox cannot grow unbounded.
- Captures weave into project cards on the dashboard, not a separate inbox. There is no "inbox view" to feel guilty about — captures appear contextually where they belong.
- AI categorization on ingest means captures are immediately useful (attached to a project) rather than sitting in limbo waiting for manual filing.
- The daily dashboard view surfaces 2-3 stale captures as ambient nudges, not a TODO list demanding action.
- Explicitly design for the "90% of captures are throwaway" reality. Most captured thoughts are fleeting impulses. The system should make it cheap to dismiss, not precious to keep.

**Detection (warning signs):**
- Capture count grows faster than processing count for 2+ weeks
- User stops opening the capture view / stops using iOS widget
- AI categorization accuracy drops (items pile up in "uncategorized")

**Phase relevance:** Must be addressed in the Capture System phase. The data model and AI triage loop are foundational — retrofitting "auto-expire" onto a system designed for permanent storage is painful.

---

### Pitfall 2: The "Last Environment" Perfectionism Trap

**What goes wrong:** Because this is declared as "the last environment I'll ever build," every decision carries existential weight. The foundation must be perfect because it's permanent. This leads to analysis paralysis on stack choices, over-engineering the plugin architecture for hypothetical future needs, and spending weeks on infrastructure before shipping anything that provides daily value.

**Why it happens:** The user has built and abandoned 10+ environments. The narrative of "this time it's different" creates pressure to get everything right upfront. Combined with a technical co-founder's instinct to build robust systems, the project balloons into a 6-month infrastructure build that delivers zero value until month 5.

**Consequences:** The project joins the graveyard of abandoned environments — not because it was bad, but because it never shipped anything useful fast enough to build the daily habit. By the time v1 launches, the user's workflow has evolved and the tool doesn't fit anymore.

**Prevention:**
- Ship something that provides value in the first sprint (week 1-2). Even if it's just the dashboard reading from the existing portfolio-dashboard MCP server with zero capture functionality.
- Define "last environment" as "the last architecture," not "the last implementation." The foundation should be evolvable, not perfect. Concrete rule: no component should take more than 2 days to rip out and replace.
- Defer the plugin architecture entirely. v1 uses clean module boundaries and well-defined interfaces. The plugin system is formalized when there is a second plugin that doesn't fit the existing pattern.
- Set a hard 4-week deadline for daily-driver status. If you're not using MC every morning by week 4, something is wrong with the scope.

**Detection (warning signs):**
- More than 3 days spent on technology evaluation / comparison
- Building abstractions before having a second concrete use case
- The words "future-proof" or "extensible" appearing in design discussions
- No daily usage by week 3

**Phase relevance:** Phase 1 must be a thin, shippable slice that provides immediate value. Architecture decisions that don't affect the first shipped feature should be deferred.

---

### Pitfall 3: Dashboard Becomes a Museum — Built Once, Never Visited

**What goes wrong:** The dashboard launches with impressive information density: sprint heatmaps, commit timelines, GSD state, Mac Mini health, stale project nudges. It's beautiful on day one. By day 14, the user has internalized all the static information and there's nothing new to see. The dashboard becomes a pretty screensaver, not a daily driver. This is the "Abandoned Dashboard Syndrome" — documented extensively in enterprise contexts and even more lethal for personal tools where there's no organizational pressure to keep using it.

**Why it happens:** Static dashboards show state, not change. A developer who works in serial sprints already knows which project they're focused on. The dashboard tells them what they already know. The value proposition ("you're smarter 3 seconds after opening it") requires the dashboard to surface *new information* — not just display existing state prettier.

**Consequences:** The dashboard becomes a vanity project. The user opens it once a day out of habit, glances for 2 seconds, gets nothing new, and closes it. Eventually stops opening it.

**Prevention:**
- The dashboard must surface delta, not state. "What changed since last visit" is the primary view — new commits across all projects, completed async jobs, new captures, stale project nudges that weren't stale yesterday.
- Captures woven into project cards are the key differentiator. Every time you capture something, the relevant project card changes. This creates a reason to look.
- "Previously on..." narrative summaries should be AI-generated and contextual — not just "3 commits," but "finished the auth refactor and started the API layer."
- Mac Mini health and async job status provide genuine "what finished while I was sleeping" value, but only if there are actually async jobs running. This feature becomes dead weight if the user doesn't have long-running processes.
- Consider a digest/notification model alongside the pull-based dashboard. A morning email or push notification summarizing overnight changes gives value without requiring the user to remember to open the dashboard.

**Detection (warning signs):**
- Dashboard open duration drops below 5 seconds within 2 weeks
- User doesn't notice when dashboard data is stale/broken
- No captures appearing on project cards (means capture system isn't being used, which kills the dashboard's freshness)

**Phase relevance:** Dashboard design phase. The data model must support "last seen" timestamps and delta computation from the start. Retrofitting "what changed" onto a state-display dashboard requires rethinking the entire data flow.

---

### Pitfall 4: AI Categorization Erodes Trust, Users Route Around It

**What goes wrong:** The AI auto-categorization that links captures to projects gets it wrong 20-30% of the time. Captures about "authentication" go to the wrong project. Voice captures with ambiguous context get miscategorized. The user starts checking and correcting every AI decision, which is more friction than manually categorizing in the first place. They lose trust in the AI layer and either stop capturing or start treating all captures as uncategorized.

**Why it happens:** AI categorization accuracy depends heavily on the quality and distinctiveness of project descriptions, the clarity of the capture input (voice transcriptions are noisy), and the number of active projects (12+ creates a large classification space with overlapping domains). Research shows that even small misclassification rates erode user trust over time, and the correction overhead creates the exact friction the system was designed to eliminate.

**Consequences:** The zero-friction promise is broken. The user now has two choices: trust wrong categorizations (captures in wrong places, missing context) or manually verify every one (defeats the purpose). Either way, the system fails its core value proposition.

**Prevention:**
- Start with confidence thresholds. High-confidence matches auto-assign. Low-confidence captures show top 2-3 suggestions and let the user tap to confirm. Unknown captures go to a general bucket, not a random project.
- Use project names, recent commit messages, and existing captures as classification context — not just project descriptions. The richer the context, the better the accuracy.
- Track accuracy over time. If the user corrects a categorization, feed that back into the prompt/model. Build a small corrections corpus per-project.
- Design the UI so that recategorizing is a single tap/swipe, not a multi-step process. If correction is effortless, wrong categorizations are annoying but not fatal.
- Accept that "uncategorized" is a valid, permanent state. Some captures are general thoughts. Don't force every capture into a project bucket.

**Detection (warning signs):**
- User correction rate exceeds 25% in the first month
- "Uncategorized" bucket grows faster than categorized captures
- User stops using voice capture (the lowest-fidelity, hardest-to-categorize input)

**Phase relevance:** Capture System phase. The AI triage pipeline must be designed with confidence scoring and easy correction from day one. Hard to retrofit graceful degradation onto a system that assumes AI is always right.

---

### Pitfall 5: Offline Sync Becomes an Engineering Black Hole

**What goes wrong:** The offline capture requirement (iOS must work when Mac Mini is unreachable) seems simple: queue locally, sync when connected. In reality, it's a distributed systems problem. Conflict resolution, ordering guarantees, deduplication of retried uploads, handling schema changes between offline periods, and sync state UI all compound into weeks of engineering that produce zero user-visible value beyond "it works when offline."

**Why it happens:** Offline-first sync is one of the most underestimated problems in mobile development. "Just queue and replay" sounds trivial, but edge cases multiply: what if the same capture is submitted via CLI and iOS simultaneously? What if the server schema changed while the device was offline? What if a sync fails midway? Each edge case requires its own solution.

**Consequences:** The offline sync system consumes 30-50% of the iOS development effort, pushing back the date when the iOS companion is actually useful. Worse, bugs in the sync layer (duplicate captures, lost captures, ordering issues) directly erode trust in the capture system.

**Prevention:**
- For v1, implement "offline queue with dumb replay." Captures are append-only, immutable after creation. No editing, no deletion from the queue. The server is the source of truth, and offline captures are fire-and-forget uploads. This eliminates conflict resolution entirely for v1.
- Use a simple sequential ID + timestamp approach. If a duplicate arrives, the server deduplicates by content hash + timestamp proximity.
- Do not attempt bidirectional sync in v1. The iOS app reads from server and writes to server. It does not maintain a local replica of server state.
- Defer real offline-first (with local state, bidirectional sync, conflict resolution) until there's evidence the user actually uses the iOS app while offline frequently enough to justify it.
- Voice captures with audio files add complexity — large binary uploads need chunked retry logic. Consider storing audio locally and uploading in background, with the text transcription syncing immediately.

**Detection (warning signs):**
- More than 1 week spent on sync logic before the basic capture flow works end-to-end
- Building conflict resolution before having two clients that can actually conflict
- Sync bugs appearing in the first week of daily use

**Phase relevance:** iOS Companion phase. The data model must be designed for append-only captures from the start (Capture System phase), but the sync implementation should be kept minimal in the iOS phase.

---

## Moderate Pitfalls

---

### Pitfall 6: Information Density Overload — The Dashboard Becomes a Cockpit

**What goes wrong:** The departure board layout with hero card, sprint heatmap, commit timelines, GSD state, health indicators, stale nudges, and capture counts creates a wall of data. The user's eye doesn't know where to look. Cognitive load research shows that humans max out at 7 +/- 2 units of information, and dashboards with 9+ modules overwhelm users. The dashboard goes from "instant awareness" to "I need to spend 30 seconds parsing this."

**Prevention:**
- Progressive disclosure: the default view shows 3-5 key signals (hero card, top 3 project rows, capture count). Everything else is one click/scroll away.
- "What changed" badges on collapsed sections tell the user whether it's worth expanding without requiring them to read everything.
- Test the "3-second rule" relentlessly: can you absorb the dashboard's primary message in 3 seconds? If not, cut information.

**Phase relevance:** Dashboard design phase. Start with the minimal view and add density only when the user requests it.

---

### Pitfall 7: API-First Over-Engineering for a Single User

**What goes wrong:** Building a "clean, well-designed API built like a product" for a system with exactly one user and three clients (dashboard, iOS, CLI) that are all built by the same person. The API gets formal versioning, OpenAPI specs, rate limiting, pagination, and error code taxonomies. This is 3 weeks of API polish that could have been 3 days of "it works."

**Prevention:**
- Build the API as an internal contract, not a public product. Simple REST or even tRPC-style type-safe RPC. No versioning, no pagination (you have 12 projects, not 12,000), no formal error codes.
- The API is "good enough when the iOS app can call it and the dashboard can render from it." Full stop.
- Revisit API formalization only if/when the "company as a codebase" vision materializes and someone else actually builds a client.

**Phase relevance:** API Platform phase. Design the API to serve the dashboard and iOS app, not to be a product.

---

### Pitfall 8: Voice Capture Friction Kills the "Zero Friction" Promise

**What goes wrong:** Voice capture sounds magical — talk into your phone, AI transcribes and categorizes. In practice: the user has to open the app, tap record, wait for transcription (500-1200ms latency for cloud, plus potential errors), review the transcription for accuracy, then either correct it or accept a garbled version. Total interaction time: 15-30 seconds. A text capture takes 5 seconds.

**Prevention:**
- Voice capture must work from the iOS widget or lock screen — not require opening the full app.
- Use on-device transcription (Apple Speech framework) for speed and privacy. Accept lower accuracy in exchange for zero latency.
- Store the audio alongside the transcription so the user can re-listen instead of reading a bad transcription. The audio is the source of truth, the text is a searchable index.
- Don't gate captures on transcription quality. "Garbled text + good audio" is a perfectly valid capture. The user's future self can listen.

**Phase relevance:** iOS Companion phase. Voice capture is a differentiator but should not block the core capture flow (text + share sheet).

---

### Pitfall 9: MCP Server Becomes a Maintenance Burden

**What goes wrong:** The dual MCP role (consuming portfolio-dashboard MCP + exposing MC's own MCP server) means MC has a dependency on an evolving protocol. MCP specs have changed multiple times (2024-11-05, 2025-03-26, 2025-06-18, 2025-11-25), and each update can break existing integrations. The MC MCP server works great in Claude Code today, then a Claude update changes MCP behavior and captures from Claude Code sessions stop working silently.

**Prevention:**
- Treat MCP as a convenience layer, not a critical path. The API is the source of truth. MCP is a thin wrapper that calls the API. If MCP breaks, the dashboard, iOS app, and CLI still work.
- Pin MCP SDK versions and don't chase every spec update. Update MCP only when Claude Code actually breaks.
- The consuming side (reading from portfolio-dashboard MCP) should be replaced with direct API calls to portfolio-dashboard's underlying data as soon as practical. Don't chain MCP servers together.

**Phase relevance:** API Platform phase. MCP integration should be one of the last features, not foundational infrastructure.

---

### Pitfall 10: The Tailscale/Mac Mini Single Point of Failure

**What goes wrong:** The Mac Mini is the sole server. macOS updates can break Tailscale connectivity (documented "sleep death" issue on macOS). Power outages, macOS auto-updates restarting the machine, or Tailscale auth key expiration all cause the entire system to go dark. The dashboard shows nothing. The iOS app can't sync. The CLI gets connection errors.

**Prevention:**
- Ensure Tailscale runs as a system daemon (via Homebrew launchd), not a user-level process. This survives sleep, user logout, and fast user switching.
- Disable automatic macOS updates or schedule them for known maintenance windows.
- The dashboard should gracefully degrade when the API is unreachable — show cached data with a "last updated: 2 hours ago" indicator, not a blank screen or error page.
- iOS offline queue is the critical mitigation: captures are never lost even if the server is down for hours.
- Consider a lightweight health-check that alerts (push notification, email) when the Mac Mini has been unreachable for >15 minutes.

**Phase relevance:** Infrastructure/deployment phase. The Tailscale daemon setup should be part of the initial deployment, not an afterthought.

---

## Minor Pitfalls

---

### Pitfall 11: iOS Share Sheet Extension Memory Limits

**What goes wrong:** iOS share extensions are limited to 120MB of memory. Sharing large images or files through the MC share sheet extension can cause silent crashes. The user shares something, thinks it was captured, but the extension was killed by iOS. Lost captures are the worst UX failure for a capture system.

**Prevention:**
- The share sheet extension should capture metadata and a reference (URL, file path) rather than the full payload. Heavy processing (image resizing, file upload) happens in the main app or as a background task.
- Implement a confirmation UI in the extension: "Captured!" is not shown until the local queue write succeeds.
- Test with large payloads (10MB+ images, long URLs with preview data) during iOS development.

**Phase relevance:** iOS Companion phase.

---

### Pitfall 12: "Super-App Shell" Architecture Premature Abstraction

**What goes wrong:** Building the iOS app as a "super-app container that can eventually load mini-app modules" in v1 adds architectural complexity (module loading, navigation routing, state isolation between modules) for a feature that has zero users and zero modules. The super-app abstraction constrains the v1 capture client's design for the sake of hypothetical future flexibility.

**Prevention:**
- Build a simple, focused iOS capture app. No module system, no dynamic loading, no plugin architecture.
- Use clean SwiftUI view composition and well-defined ViewModels. When a second "module" is needed, refactor into a container at that point — not before.
- The "super-app" concept is a future milestone explicitly listed as out of scope in PROJECT.md. Respect that boundary.

**Phase relevance:** iOS Companion phase. Ship the capture client, not the platform.

---

### Pitfall 13: The Heatmap Nobody Reads

**What goes wrong:** The sprint heatmap (GitHub-style contribution grid, one row per project) sounds insightful but requires weeks of historical data to be meaningful. On day one, it's empty. On day 30, it shows the obvious: you worked on the one project you were sprinting on. The insight density is low relative to the screen real estate it consumes.

**Prevention:**
- Make the heatmap a progressive enhancement that appears after 30+ days of data, not a launch feature.
- Consider whether the hero card's "last 3-5 commits as mini-timeline" provides the same serial-sprint insight in a more compact form.
- If building it, populate it retroactively from git history so it has data on day one.

**Phase relevance:** Dashboard phase. Build it last among the dashboard features, if at all.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Dashboard (initial) | Museum effect — static state nobody revisits | Lead with "what changed since last visit" view, not state display |
| Dashboard (design) | Cognitive overload from information density | Start minimal (3-5 signals), add density only when requested |
| Capture System | Graveyard inbox — captures accumulate, never processed | Auto-triage with expiry, woven into project cards, cheap dismiss |
| Capture System | AI categorization erodes trust | Confidence thresholds, easy single-tap correction, "uncategorized" is valid |
| API Platform | Over-engineering for one user | Internal contract, not public product. No versioning, no pagination |
| API Platform | MCP dependency on evolving spec | MCP is convenience layer over API, not critical path |
| iOS Companion | Offline sync engineering black hole | Append-only captures, fire-and-forget upload, no bidirectional sync in v1 |
| iOS Companion | Share sheet memory crashes | Capture metadata only, defer heavy processing to main app |
| iOS Companion | Super-app premature abstraction | Build focused capture client, not module platform |
| iOS Companion | Voice capture friction | On-device transcription, store audio as source of truth |
| Infrastructure | Mac Mini single point of failure | Tailscale as daemon, graceful degradation, offline queues |
| All Phases | "Last environment" perfectionism | Ship value in week 1-2, 4-week daily-driver deadline |

---

## Meta-Pattern: Why This User's Previous 10+ Systems Failed

Based on the project context, every previous capture/task system was abandoned due to the same four forces:

1. **Too much friction** — The capture path required too many taps, too much categorization, too much thought. The user reverted to WhatsApp/mental notes.
2. **Becomes a graveyard** — Items went in but never came out. The system became a guilt-generating archive.
3. **Doesn't fit flow** — The tool required changing behavior to match the tool's model. The user's actual workflow (serial sprints, idea capture from anywhere, morning check-ins) wasn't reflected in the system's design.
4. **Over-structured** — Taxonomies, tags, folders, statuses. The organizational overhead exceeded the organizational value.

**The single most important design principle for MC:** The system must provide value passively (you see something useful by opening it) and accept input permissively (dump anything, the system figures it out). The moment it demands effort — filing, tagging, processing, organizing — it's on the path to abandonment.

**The nuclear test:** If the user stops capturing for a week, what happens when they come back? If the system guilts them with "247 unprocessed captures," it fails. If it says "here's what changed across your projects, and you had 3 ideas last month that might be relevant to what you're working on now," it wins.

---

## Sources

- [The Abandoned Dashboard Syndrome - Impactful Engineering](https://impactful.engineering/blog/the-abandoned-dashboard-syndrome/)
- [Why I'm Giving Up on a Second Brain - Sudo Science](https://sudoscience.blog/2025/11/08/why-im-giving-up-on-a-second-brain/)
- [Why I Stopped My Second Brain - Medium](https://thisisvschauhan.medium.com/why-i-stopped-my-second-brain-088998e7801e)
- [The PKM Paradox - Medium](https://medium.com/@helloantonova/the-pkm-paradox-why-most-knowledge-management-tools-fail-to-meet-our-needs-d5042f08f99e)
- [It's a Tool, Not a Goal - PKM Simplicity](https://www.dsebastien.net/its-a-tool-not-a-goal-why-your-pkm-system-should-stay-simple/)
- [Scope Creep: Solo Indie Game Development - Wayline](https://www.wayline.io/blog/scope-creep-solo-indie-game-development)
- [Premature Abstraction in Software Design - Code World](https://codeworld.blog/posts/system%20design/architecture/PrematureAbstraction/)
- [YAGNI Principle - AlgoMaster](https://algomaster.io/learn/lld/yagni)
- [Offline-First Mobile App Architecture - Medium](https://medium.com/@jusuftopic/offline-first-architecture-designing-for-reality-not-just-the-cloud-e5fd18e50a79)
- [Dealing with Memory Limits in iOS App Extensions - Igor Kulman](https://blog.kulman.sk/dealing-with-memory-limits-in-app-extensions/)
- [Six Fatal Flaws of the Model Context Protocol - Scalifi AI](https://www.scalifiai.com/blog/model-context-protocol-flaws-2025)
- [How Misclassification Severity Influences User Trust in AI - ACM](https://dl.acm.org/doi/10.1145/3715275.3732187)
- [Dashboard Design: Information Architecture for Cognitive Overload - Sanjay Dey](https://www.sanjaydey.com/saas-dashboard-design-information-architecture-cognitive-overload/)
- [Four Cognitive Design Guidelines for Dashboards - UX Magazine](https://uxmag.com/articles/four-cognitive-design-guidelines-for-effective-information-dashboards)
- [Speech-to-Text Latency - Picovoice](https://picovoice.ai/blog/speech-to-text-latency/)
- [Tailscale macOS Troubleshooting - Tailscale Docs](https://tailscale.com/docs/reference/troubleshooting/apple)
- [macOS Server Mode Issue - Tailscale GitHub](https://github.com/tailscale/tailscale/issues/987)
- [6 Reasons Why KM Implementations Fail - KM Institute](https://www.kminstitute.org/blog/6-reasons-why-knowledge-management-implementations-fail)
