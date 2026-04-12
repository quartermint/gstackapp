---
phase: 17-auth-harness-independence
plan: 02
subsystem: operator-intake
tags: [operator, intake-form, request-history, login, auth-routing, session-isolation]
dependency_graph:
  requires: [authMiddleware, getUserScope, users-table, userSessions-table, magicLinkTokens-table, auth-routes]
  provides: [operatorRequests-table, auditTrail-table, operator-routes, IntakeForm, RequestHistory, OperatorHome, LoginPage, auth-aware-routing]
  affects: [packages/api/src/index.ts, packages/web/src/App.tsx, packages/web/src/components/layout/Sidebar.tsx]
tech_stack:
  added: [date-fns formatDistanceToNow, TanStack Query useMutation]
  patterns: [session-scoped queries via getUserScope, Zod validation with max length, role-based view routing]
key_files:
  created:
    - packages/api/src/auth/tailscale.ts
    - packages/api/src/auth/roles.ts
    - packages/api/src/auth/magic-link.ts
    - packages/api/src/auth/middleware.ts
    - packages/api/src/routes/auth.ts
    - packages/api/src/routes/operator.ts
    - packages/api/src/__tests__/operator-request.test.ts
    - packages/web/src/components/operator/IntakeForm.tsx
    - packages/web/src/components/operator/RequestHistory.tsx
    - packages/web/src/components/operator/OperatorHome.tsx
    - packages/web/src/components/auth/LoginPage.tsx
  modified:
    - packages/api/src/db/schema.ts
    - packages/api/src/index.ts
    - packages/api/src/__tests__/helpers/test-db.ts
    - packages/web/src/App.tsx
    - packages/web/src/components/layout/Sidebar.tsx
decisions:
  - Auth infrastructure from Plan 01 recreated in this worktree using SQLite types (not pgTable) to match existing codebase schema pattern
  - Auth middleware bypasses in test env preserved from Plan 01 design (NODE_ENV=test skip)
  - Operator view routes to OperatorHome for operator role, existing dashboard for admin
key-decisions:
  - SQLite auth tables instead of Postgres (matching existing codebase)
  - Role-based view routing in App.tsx (operator -> OperatorHome, admin -> dashboard)
metrics:
  duration: 8m
  completed: "2026-04-11T18:30:30Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 8
  tests_total: 366
---

# Phase 17 Plan 02: Operator Intake + Auth Routing Summary

Operator intake form with session-scoped request history, magic link login page, and auth-aware routing that directs operators to OperatorHome and admins to the existing dashboard.

## What Was Built

### Task 1: Operator API Routes + Schema (TDD)

- **Schema**: Added `users`, `magicLinkTokens`, `userSessions`, `operatorRequests`, `auditTrail` tables to SQLite schema with proper indexes and FK constraints
- **Auth infrastructure**: Recreated 17-01 auth system adapted for SQLite (Tailscale whois, role resolver, magic link, auth middleware, auth routes) since parallel worktree did not have Plan 01 commits merged
- **Operator routes**: POST /request (Zod validated, 5000 char max per T-17-09), GET /history (session-scoped per T-17-10), GET /request/:id (with 403 for cross-user access)
- **Audit trail**: Logged on every request submission with action type and truncated context
- **Wiring**: Auth middleware on /api/* with exclusions for login flow + health + webhook; operator routes mounted at /api/operator
- **TDD**: 8 tests (creation, validation, session isolation, admin access, audit trail, access control)

### Task 2: Operator UI Components

- **IntakeForm**: Three-field form (whatNeeded textarea, whatGood textarea, deadline text input) per D-05. useMutation to POST, invalidates history query on success, inline success/error feedback
- **RequestHistory**: useQuery for GET /history, status badges (pending=yellow, running=blue, complete=green, failed=red), truncated descriptions, relative timestamps via date-fns
- **OperatorHome**: Composes IntakeForm + RequestHistory per D-06 ("operator home IS the intake form"). Heading "What can I help with?" in display font
- **LoginPage**: Centered email input + "Send Magic Link" button, success confirmation, 403 error handling per D-01
- **App.tsx**: Auth check via GET /api/auth/me, role-based routing (unauthenticated -> LoginPage, operator -> OperatorHome, admin -> existing dashboard)
- **Sidebar**: Added `operator` to AppView union type

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | b114362 | test | Add failing tests for operator request routes (TDD RED) |
| 2 | b44b2d0 | feat | Add operator request routes, auth system, and schema tables (TDD GREEN) |
| 3 | 8979796 | feat | Add operator UI, login page, and auth-aware routing |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Auth infrastructure missing in worktree**
- **Found during:** Task 1 setup
- **Issue:** Plan 17-01 was executed in a different parallel worktree. Auth files (middleware, tailscale, roles, magic-link, routes) and schema tables (users, userSessions, magicLinkTokens) were not present in this worktree. Cherry-pick failed due to pgTable vs sqliteTable conflicts.
- **Fix:** Recreated all auth infrastructure files adapted to SQLite types (integer timestamps instead of pg timestamps, sqliteTable instead of pgTable, synchronous .run()/.all()/.get() instead of async). Combined with Plan 02's new tables (operatorRequests, auditTrail) in a single schema update.
- **Files created:** packages/api/src/auth/tailscale.ts, roles.ts, magic-link.ts, middleware.ts, packages/api/src/routes/auth.ts

## Threat Model Compliance

All mitigations from the plan's threat model are implemented:
- **T-17-09 (Tampering)**: Zod validation with max 5000 chars; userId from auth context not request body
- **T-17-10 (Information Disclosure)**: getUserScope enforces WHERE userId=? for operators; admin sees all
- **T-17-11 (Spoofing)**: All operator routes protected by authMiddleware (NODE_ENV=test bypass for testing only)
- **T-17-12 (Tampering)**: Client-side validation + server-side Zod; React auto-escapes HTML
- **T-17-13 (Information Disclosure)**: 403 on unknown email accepted per threat model

## Known Stubs

None. All components are wired to real API endpoints. IntakeForm submits to POST /api/operator/request. RequestHistory fetches from GET /api/operator/history. LoginPage posts to POST /api/auth/magic-link.

## Self-Check: PASSED

- All 11 created files verified on disk
- All 3 commits verified in git log
- 366 tests passing (8 new + 358 existing)
- Web build succeeds
