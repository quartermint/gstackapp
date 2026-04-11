# Phase 17: Auth & Harness Independence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 17-auth-harness-independence
**Areas discussed:** Auth UX flow, Session isolation, Pipeline trigger UX, Harness web execution

---

## Auth UX Flow

### First Visit Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect Tailscale (Recommended) | Check Tailscale IP, auto-identify if on tailnet, show login page with magic link if not | ✓ |
| Always show login | Everyone sees login page first, Tailscale button + magic link option | |
| Tailscale-only, no magic link | Only tailnet users can access, simplifies auth | |

**User's choice:** Auto-detect Tailscale
**Notes:** Zero friction for tailnet users (Ryan, team). External users get clean magic link flow.

### Session Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| 7-day cookie (Recommended) | httpOnly secure cookie, weekly re-auth for external users | ✓ |
| 30-day cookie | Month-long sessions, less friction | |
| Session-only (browser close) | Most secure, most friction | |

**User's choice:** 7-day cookie

### Role Mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded allowlist (Recommended) | Config/env lists admin and operator emails | ✓ |
| First user is admin | Self-service ordering | |
| Invite system | Admin sends invite links with role | |

**User's choice:** Hardcoded allowlist

---

## Session Isolation

| Option | Description | Selected |
|--------|-------------|----------|
| Own requests only (Recommended) | Operators see only their own history. Admin sees all. | ✓ |
| Shared view, own actions | All operators see all requests (read-only), act on own | |
| Fully shared | Everyone sees and acts on everything | |

**User's choice:** Own requests only

---

## Pipeline Trigger UX

### Intake Form Style

| Option | Description | Selected |
|--------|-------------|----------|
| Structured intake form (Recommended) | Three fields matching OP-01: need, quality, deadline | ✓ |
| Chat-like input | Single text box, system extracts structure | |
| Hybrid | Text box first, system asks follow-ups | |

**User's choice:** Structured intake form

### Navigation Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Operator home IS the form (Recommended) | Form is the landing page, history below | ✓ |
| Sidebar tab | Form is a tab alongside history | |
| Floating action button | FAB opens modal form over history view | |

**User's choice:** Operator home IS the form

---

## Harness Web Execution

### Execution Model

| Option | Description | Selected |
|--------|-------------|----------|
| Direct API calls in-process (Recommended) | Hono server calls Claude/Gemini APIs directly via ModelRouter | |
| Spawn Claude Code subprocess | Shell out to `claude` CLI for each pipeline run | ✓ |
| Worker thread | Node.js worker thread per pipeline run | |

**User's choice:** Spawn Claude Code subprocess
**Notes:** User chose subprocess over recommended direct API calls. Gets the full agent loop (tool_use, reasoning, multi-turn) for free without reimplementing it.

### Output Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Parse stdout stream (Recommended) | Pipe Claude Code JSON output, transform to SSE events | |
| File-based handoff | Claude Code writes to temp dir, server polls | ✓ |
| IPC / Unix socket | Bidirectional communication via Unix domain socket | |

**User's choice:** File-based handoff
**Notes:** Simpler than stream parsing. User accepted the tradeoff of not having real-time streaming.

### Polling Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 2-second poll + fs.watch (Recommended) | Near real-time via file system events | |
| 5-second poll | Simple interval, acceptable for operator use case | |
| Hybrid: poll + completion webhook | Poll for progress, local HTTP callback for completion | ✓ |

**User's choice:** Hybrid poll + completion webhook
**Notes:** Progress updates via polling, completion guarantee via local HTTP callback from Claude Code.

---

## Claude's Discretion

- Poll interval for progress updates
- Claude Code CLI flags and subprocess configuration
- Temp directory structure and file naming
- Local webhook endpoint path and payload format

## Deferred Ideas

None
