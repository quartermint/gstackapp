---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/hooks/use-projects.ts
autonomous: false
must_haves:
  truths:
    - "Dashboard shows no error banner when API is reachable and projects load"
    - "Error banner clears automatically if API becomes reachable after initial failure"
  artifacts:
    - path: "packages/web/src/hooks/use-projects.ts"
      provides: "Project fetching hook with proper error state clearing"
  key_links:
    - from: "packages/web/src/hooks/use-projects.ts"
      to: "packages/web/src/App.tsx"
      via: "error state drives ErrorBanner visibility"
      pattern: "setError\\(null\\)"
---

<objective>
Fix the "Failed to fetch" error banner that persists on the Mission Control dashboard even after projects load successfully.

Purpose: The dashboard shows a sticky error banner at the bottom because `useProjects()` never clears its error state on successful refetch. When the dashboard loads before the API is fully ready (race condition on startup), the initial fetch fails, error state is set, and subsequent successful fetches (triggered by SSE `scan:complete`) populate projects but never clear the error.

Output: Dashboard error banner disappears when projects load successfully.
</objective>

<execution_context>
@/Users/ryanstern/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ryanstern/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/web/src/hooks/use-projects.ts
@packages/web/src/App.tsx

<interfaces>
From packages/web/src/hooks/use-projects.ts:
```typescript
export function useProjects(): {
  groups: GroupedProjects | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
```

From packages/web/src/App.tsx (line 24):
```typescript
const { groups, loading, error, refetch: refetchProjects } = useProjects();
```
ErrorBanner renders when `error` is truthy (line 171):
```tsx
{error && <ErrorBanner message={error} />}
```
</interfaces>

**Root cause analysis:**

In `useProjects()` (packages/web/src/hooks/use-projects.ts), the `fetchProjects` function:
- On ERROR (line 41): calls `setError(err.message)` -- sets error state
- On SUCCESS (line 36): calls `setProjects(...)` and `setLoading(false)` -- but NEVER calls `setError(null)`

So if the first fetch fails (API not ready on startup), then a refetch succeeds (via SSE or interval), projects appear correctly but the error banner stays permanently visible.

The API is confirmed working on port 3001. The `data/` directory and SQLite DB are auto-created by `createDatabase()` which calls `mkdirSync` with `recursive: true`. No migration script is needed -- Drizzle migrations run automatically on DB initialization.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Clear error state on successful fetch in useProjects</name>
  <files>packages/web/src/hooks/use-projects.ts</files>
  <action>
    In the `fetchProjects` async function inside `useEffect`, add `setError(null)` in the success path immediately before `setProjects(data.projects ...)`. This ensures any previous error is cleared when a fetch succeeds.

    The fix is a single line addition at line 36 (before `setProjects`):
    ```
    setError(null);
    ```

    This follows the same pattern already used in the error path which sets `setError(err.message)`.
  </action>
  <verify>
    <automated>cd /Users/ryanstern/mission-control && pnpm --filter @mission-control/web typecheck</automated>
  </verify>
  <done>
    - `useProjects()` clears error state on successful fetch
    - TypeScript compiles without errors
    - Error banner will no longer persist after projects load successfully
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify dashboard error banner is resolved</name>
  <files>packages/web/src/hooks/use-projects.ts</files>
  <action>
    Human verifies the fix works in the browser.
  </action>
  <verify>Visual inspection in browser</verify>
  <done>No error banner visible when API is running</done>
</task>

</tasks>

<verification>
- `pnpm --filter @mission-control/web typecheck` passes
- Dashboard loads without error banner when API is running
- Error banner auto-clears when API becomes reachable after downtime
</verification>

<success_criteria>
Dashboard shows no persistent "Failed to fetch" error banner when the API is running and serving data correctly.
</success_criteria>

<output>
After completion, create `.planning/quick/2-fix-dashboard-failed-to-fetch-error-init/2-SUMMARY.md`
</output>
