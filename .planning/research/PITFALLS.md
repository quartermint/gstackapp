# Domain Pitfalls

**Domain:** Session orchestration + model tier routing + local LLM gateway
**Researched:** 2026-03-15

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or fundamentally broken features.

### Pitfall 1: Hook Scripts That Block Claude Code

**What goes wrong:** Session reporter hooks add latency to every Claude Code operation. A slow or hanging `curl` call in a PostToolUse hook blocks the agent from proceeding to the next tool call. At scale, this makes Claude Code unusably slow.

**Why it happens:** Hook scripts run synchronously by default. If the MC API is down, unreachable (Mac Mini sleeping), or slow, the hook hangs until timeout. With PostToolUse hooks on Write/Edit/Bash (the most frequent tools), this creates per-operation latency.

**Consequences:** Claude Code becomes sluggish. User disables hooks. Session tracking goes dark.

**Prevention:**
- Fire-and-forget pattern: background the curl call (`curl ... &`) and `exit 0` immediately
- Short timeouts: `--max-time 2` for heartbeats, `--max-time 3` for start/stop
- Never block on API response. Session data is nice-to-have, not critical-path.
- Test hook latency: `time ~/.claude/hooks/session-reporter.sh < test-input.json` must be < 100ms

**Detection:** Claude Code responses feel slow. Dashboard shows sparse session data despite active coding.

### Pitfall 2: Heartbeat Flood from PostToolUse

**What goes wrong:** Registering a PostToolUse hook on all tool types generates enormous traffic. A single Claude Code turn can fire 5-20 tool calls (Read, Grep, Glob, Bash, Write). Each one triggers an HTTP POST to MC. The sessions table bloats with redundant heartbeats.

**Why it happens:** The matcher is too broad. Most tool calls (Read, Grep, Glob) don't touch files and have no value for conflict detection.

**Consequences:** MC API gets 100+ heartbeat requests per minute per session. SQLite write contention. Dashboard flickers with rapid SSE updates. Battery drain on laptop.

**Prevention:**
- Matcher must be narrow: `"Write|Edit"` only (possibly Bash for `mv`, `cp`, `rm`)
- Debounce heartbeats server-side: accept but deduplicate within 10-second window
- Store files_touched as a cumulative set (JSON array), not per-heartbeat
- Consider: skip PostToolUse entirely, rely on Stop hook + git diff for files touched

**Detection:** MC API logs show > 50 requests/minute from session hooks. SQLite WAL file grows unexpectedly.

### Pitfall 3: Session State Goes Stale (Abandoned Sessions)

**What goes wrong:** A Claude Code session crashes, the user closes the terminal, or the laptop loses network. The Stop hook never fires. MC shows the session as "active" indefinitely. Conflict detection warns about phantom sessions.

**Why it happens:** Stop hooks only fire on graceful completion. User interrupts (Ctrl+C), terminal closes, SSH disconnects, and crashes all skip the Stop hook. SessionEnd hook fires on some of these but not all.

**Consequences:** Dashboard shows ghost sessions. Conflict detection raises false alerts. Budget tracking over-counts (session marked active but no work happening).

**Prevention:**
- **Session reaper**: Background timer (every 2-5 minutes) marks sessions with no heartbeat for > 15 minutes as "abandoned"
- Use `lastHeartbeatAt` as the liveness signal, not just start/stop events
- SessionEnd hook (fires on terminal close, Ctrl+C) as a secondary signal alongside Stop
- Dashboard shows "last activity: 47 minutes ago" on stale sessions, letting user visually identify ghosts
- Status enum: `active` -> `completed` (normal), `active` -> `abandoned` (reaper), `active` -> `error` (crash detected)

**Detection:** Multiple "active" sessions for the same project when user is only running one.

### Pitfall 4: CWD-to-Project Resolution Fails for Subagents and Worktrees

**What goes wrong:** Claude Code subagents (Task tool) report a different `cwd` than the parent session. Git worktrees report paths like `/Users/ryanstern/mission-control-wt-1234/` that don't match the registered project path `/Users/ryanstern/mission-control`. Sessions get `projectSlug: null` and disappear from project cards.

**Why it happens:** Subagent cwds might be temporary directories. Worktree paths are unique per session. The simple `cwd.startsWith(project.path)` match fails.

**Consequences:** Sessions not linked to projects. Conflict detection doesn't fire (no project overlap detected). Session dashboard shows unlinked sessions.

**Prevention:**
- Match by git remote URL as fallback (same approach as v1.1 copy detection)
- Support prefix matching: `/Users/ryanstern/mission-control` matches `/Users/ryanstern/mission-control/packages/api`
- For worktrees: resolve to primary repo path via `git worktree list --porcelain` or by checking `.git` file content
- For subagents: inherit project_slug from parent session if `agent_id` is present in hook data

**Detection:** Sessions with `projectSlug: null` in the database despite working in a tracked project directory.

## Moderate Pitfalls

### Pitfall 5: Budget Heuristics Are Misleading

**What goes wrong:** Budget shows "You've used $X this week" but the number is wildly inaccurate. User makes decisions based on bad data. Either over-restricts (misses Opus for architecture work) or over-spends (thinks budget is fine when it's not).

**Prevention:**
- Label all cost estimates as "estimated" prominently
- Track session count, not dollars. "12 Opus sessions this week" is factual. "$72 estimated" is not.
- Show ranges not points: "~$50-100 estimated" acknowledges uncertainty
- Provide link to Claude billing page for actual numbers
- Never auto-restrict based on heuristics. Suggestions only, user decides.

### Pitfall 6: LM Studio Cold Start Causes Routing Failures

**What goes wrong:** LM Studio is "available" (API responds) but the model isn't loaded yet. First request takes 30-60 seconds to load model weights into memory. MC reports "Local tier available" but the first local inference hangs.

**Prevention:**
- Health probe should check not just API availability but loaded model list
- `GET /v1/models` returns empty array when no model is loaded vs model list when ready
- Distinguish three states: `unavailable` (API down), `loading` (API up, no model), `ready` (API up, model loaded)
- Dashboard shows "Local: loading..." vs "Local: ready (Qwen3-Coder-30B)"
- Consider: pre-load model on MC startup by sending a trivial inference request

### Pitfall 7: Hook Configuration Conflicts with Existing Hooks

**What goes wrong:** Adding session hooks to `~/.claude/settings.json` accidentally removes or conflicts with existing hooks (bash-safety, write-safety, context-warning, session-summary, risks-digest). The settings.json hooks array is a flat list -- adding new entries requires careful merge.

**Prevention:**
- Read existing settings.json before adding hooks (never overwrite)
- Session hooks should be additive: new entries in existing event arrays
- Test with `claude --print-hooks` to verify all hooks are registered
- Document the exact JSON patch, not the full settings file
- For PostToolUse: session heartbeat must coexist with context-warning.sh and gsd-context-monitor.js

### Pitfall 8: Aider Wrapper Script UX Friction

**What goes wrong:** User types `aider` out of muscle memory instead of `mc-aider`. Session tracking silently goes dark for Aider sessions. User forgets the wrapper exists.

**Prevention:**
- Shell alias: `alias aider='mc-aider'` in `.zshrc`
- Alternatively: detect Aider sessions passively via git commit attribution during scan cycle, no wrapper needed
- If using wrapper: make it invisible -- same arguments, same behavior, just adds reporting
- Fallback detection: `git log --author="(aider)" --since="30 minutes ago"` in scan cycle catches unwrapped sessions

### Pitfall 9: Race Condition Between Session Start and Project Scan

**What goes wrong:** A session starts and reports to MC before the project has been scanned. The project doesn't exist in the projects table yet. Foreign key constraint fails or session gets `null` project.

**Prevention:**
- Make `project_slug` nullable in sessions table (already planned)
- Backfill project_slug when project appears in scan results
- For known projects (in mc.config.json): resolve from config, not database
- Match cwd against config.projects[].path, not projects table

## Minor Pitfalls

### Pitfall 10: SSE Connection Limits with Session Events

**What goes wrong:** Session events fire frequently (start, heartbeat, end, conflict). Each SSE event triggers TanStack Query invalidation. Dashboard re-renders rapidly, consuming CPU.

**Prevention:**
- Don't emit SSE for heartbeats. Only emit for state changes: started, ended, conflict, abandoned
- Batch invalidation: TanStack Query `refetchInterval` of 5 seconds for session list instead of SSE-driven
- Or: SSE event triggers a single `invalidateQueries(['sessions'])`, not per-event refetch

### Pitfall 11: Model String Parsing for Tier Detection

**What goes wrong:** New model versions (claude-opus-5, claude-sonnet-5-20260401) don't match the hardcoded tier parsing regex. Sessions get classified as wrong tier or "unknown."

**Prevention:**
- Parse tier from model string prefix, not exact match: `startsWith('claude-opus')` -> opus
- Config-driven tier mapping (models section in mc.config.json) with regex patterns
- Default to "unknown" tier rather than crashing on unrecognized models
- Log warnings for unrecognized model strings so they get noticed

### Pitfall 12: File Path Normalization in Conflict Detection

**What goes wrong:** One session reports `/Users/ryanstern/mission-control/packages/api/src/routes/sessions.ts` while another reports `packages/api/src/routes/sessions.ts` (relative path). Conflict detection sees them as different files.

**Prevention:**
- Normalize all file paths to absolute before storing
- If path is relative, resolve against session's `cwd`
- Use `path.resolve(session.cwd, filePath)` before inserting into files_touched
- Strip trailing slashes, normalize `//` to `/`

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Schema/migration | Migration must not break existing v1.1 data | Additive migration only -- new tables, no ALTER existing |
| Hook scripts | PostToolUse flood | Narrow matcher to Write/Edit only, server-side debounce |
| Hook scripts | Blocking Claude Code | Fire-and-forget, background curl, always exit 0 |
| Session ingestion | Ghost sessions | Session reaper on 2-5 min timer, lastHeartbeatAt liveness |
| Session ingestion | CWD resolution failures | Git remote URL fallback, prefix matching, worktree handling |
| LM Studio gateway | Cold start | Three-state health (unavailable/loading/ready), probe loaded models |
| Budget tracking | Misleading estimates | Label as "estimated," show counts not dollars, never auto-restrict |
| Dashboard | SSE flood from frequent events | Only emit state changes, batch TanStack invalidation |
| Conflict detection | Path normalization | Resolve relative to cwd, absolute paths everywhere |
| Hook configuration | Conflicts with existing hooks | Additive merge, test with --print-hooks |

## Sources

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- Exit code behavior, blocking semantics, event timing
- [Claude Code Issue #27311](https://github.com/anthropics/claude-code/issues/27311) -- Plan files overwritten across concurrent sessions
- [Aider Git Integration](https://aider.chat/docs/git.html) -- Commit attribution patterns
- [LM Studio Docs](https://lmstudio.ai/docs/developer/openai-compat) -- Model loading behavior, /v1/models response
- Existing MC codebase analysis -- event-bus.ts patterns, session-summary.sh patterns
- [CLAUDE_SESSION_ID discussion](https://github.com/anthropics/claude-code/issues/25642) -- Session ID availability and format

---
*Researched: 2026-03-15*
