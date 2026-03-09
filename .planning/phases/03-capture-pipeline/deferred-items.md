# Deferred Items - Phase 03: Capture Pipeline

## Pre-existing Issues (Out of Scope)

1. **API typecheck failure: missing ai-categorizer module**
   - File: `packages/api/src/__tests__/services/ai-categorizer.test.ts`
   - Error: `Cannot find module '../../services/ai-categorizer.js'`
   - Cause: Test file exists for Plan 03-01 work that hasn't been executed yet
   - Resolution: Will be resolved when Plan 03-01 is executed
   - Found during: Plan 03-02, Task 1
