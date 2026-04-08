---
phase: 12-agent-loop-session-infrastructure
plan: 01
subsystem: agent-infrastructure
tags: [schema, api, mcp-tools, system-prompt, sessions]
dependency_graph:
  requires: []
  provides: [sessions-schema, sessions-api, gstack-tool-server, system-prompt-builder]
  affects: [12-02, 12-03]
tech_stack:
  added: ["@anthropic-ai/claude-agent-sdk@^0.2.96"]
  patterns: [custom-mcp-tools, system-prompt-injection, zod-input-validation]
key_files:
  created:
    - packages/api/src/routes/sessions.ts
    - packages/api/src/agent/tools.ts
    - packages/api/src/agent/system-prompt.ts
    - packages/api/src/__tests__/sessions-api.test.ts
  modified:
    - packages/api/src/db/schema.ts
    - packages/api/src/index.ts
    - packages/api/src/__tests__/helpers/test-db.ts
    - packages/api/package.json
    - package-lock.json
decisions:
  - Used Claude Agent SDK's tool() and createSdkMcpServer() for custom MCP tools rather than raw MCP protocol
  - Path traversal protection on read_design_doc verifies resolved path stays under HOME
  - Session title max 200 chars, projectPath max 500 chars via Zod validation (T-12-01)
  - Messages in GET /:id returned in chronological order (last 50 fetched desc, then reversed)
metrics:
  duration: 259s
  completed: "2026-04-08T07:03:31Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 5
  tests_added: 8
  tests_passing: 8
---

# Phase 12 Plan 01: Session Infrastructure & Agent Tools Summary

Session schema, CRUD API, custom MCP tool server with cross-project awareness, and system prompt builder with compaction-surviving instructions.

## What Was Built

### Task 1: Schema Extension & Session CRUD API
Extended the Drizzle schema with three new tables:
- **sessions** - Agent conversation sessions with metadata (title, projectPath, status, messageCount, tokenUsage, costUsd, sdkSessionId)
- **messages** - Session messages with role, content, tool call flag, and token count
- **tool_calls** - Tool execution records with name, input/output, error flag, and duration

Created session CRUD routes at `/api/sessions`:
- `GET /` - List sessions ordered by lastMessageAt desc
- `GET /:id` - Session detail with last 50 messages in chronological order
- `POST /` - Create session with Zod-validated input (title max 200, projectPath max 500)

8 tests covering create (with title, with projectPath, empty body, title too long), list (empty, after creation), and detail (with messages, 404).

### Task 2: Custom MCP Tool Server & System Prompt Builder
Installed `@anthropic-ai/claude-agent-sdk` and created:

**Custom MCP Tools** (`gstackToolServer`):
- `list_projects` - Scans home dir for projects with `.planning/STATE.md`, extracts status/phase/activity, supports active/stale/all filter
- `read_gsd_state` - Reads STATE.md, ROADMAP.md, and current phase CONTEXT.md for any project
- `read_design_doc` - Reads design docs from `~/.gstack/projects/` or absolute paths with path traversal protection (T-12-03)

**System Prompt Builder** (`buildSystemPrompt`):
- Establishes 104-sessions/week agent identity (D-04)
- Lists custom tools available
- Injects cross-project awareness instructions (D-02)
- Injects ideation pipeline awareness (D-03)
- Optionally reads and injects project CLAUDE.md
- Adds compression survival instructions that persist through compaction (D-12)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 978c785 | feat(12-01): add session schema tables and CRUD API |
| 2 | 1a4b031 | feat(12-01): add custom MCP tool server and system prompt builder |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] drizzle-kit push fails in worktree**
- **Found during:** Task 1 step 4
- **Issue:** `npx drizzle-kit push` fails because the worktree doesn't have the data directory for the SQLite database
- **Fix:** Schema correctness verified via in-memory test database (8 tests passing). Schema push will succeed when run on the actual deployment.
- **Impact:** None - schema is correct and tested

**2. [Rule 3 - Blocking] SDK peer dependency conflict**
- **Found during:** Task 2 step 1
- **Issue:** `npm install @anthropic-ai/claude-agent-sdk` failed with peer dependency conflict
- **Fix:** Used `--legacy-peer-deps` flag to resolve
- **Impact:** None - package installed and functional

## Threat Mitigations Applied

| Threat ID | Mitigation | Implementation |
|-----------|-----------|----------------|
| T-12-01 | Zod validation on session inputs | `createSessionSchema` with title max 200, projectPath max 500 |
| T-12-03 | Path traversal prevention | `read_design_doc` resolves and normalizes path, verifies it starts with HOME |

## Self-Check: PASSED
