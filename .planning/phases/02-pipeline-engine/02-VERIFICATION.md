---
phase: 02-pipeline-engine
verified: 2026-03-30T18:41:00Z
status: gaps_found
score: 4/5 success criteria verified
gaps:
  - truth: "The AI can only read files within the cloned repository -- symlink traversal and path escape attempts are blocked"
    status: partial
    reason: "Implementation is complete and tested. REQUIREMENTS.md erroneously marks PIPE-04 as 'Pending' -- the requirement was completed by plan 02-01 and is in requirements-completed in 02-01-SUMMARY.md. The tracking document was not updated after execution."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "PIPE-04 marked '[ ] Pending' in both checkbox and traceability table, but implementation exists and tests pass"
    missing:
      - "Update REQUIREMENTS.md: PIPE-04 checkbox from '- [ ]' to '- [x]' and traceability table status from 'Pending' to 'Complete'"
human_verification:
  - test: "Trigger a real PR webhook on a connected repo and observe pipeline execution"
    expected: "Pipeline sets RUNNING status, all 5 stages execute (or CEO/Design skip if not applicable), findings appear in DB within 5 minutes"
    why_human: "Requires live GitHub App installation, real ANTHROPIC_API_KEY, and actual PR event -- cannot verify without running services"
  - test: "Verify prompt caching activates for Opus stages (CEO, Security)"
    expected: "Second API call for the same stage prompt shows cache_read_input_tokens in usage"
    why_human: "Requires real Claude API call with valid key -- cannot test in unit test environment"
---

# Phase 2: Pipeline Engine Verification Report

**Phase Goal:** Every PR webhook triggers a 5-stage cognitive review pipeline that clones the repo, runs all stages in parallel via Claude tool_use with sandboxed file access, and produces structured findings
**Verified:** 2026-03-30T18:41:00Z
**Status:** gaps_found (1 documentation-only gap, no code gaps)
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | PR webhook triggers all 5 stages (CEO, Eng, Design, QA, Security) executing in parallel, completing in under 5 minutes | VERIFIED | `orchestrator.ts` calls `Promise.allSettled` over all 5 stages; `STAGE_TIMEOUT_MS = 5 * 60 * 1000` per stage; handler wired fire-and-forget with `.catch` |
| 2 | Each stage produces a Zod-validated StageResult with a PASS, FLAG, BLOCK, or SKIP verdict and typed findings | VERIFIED | `parseStageOutput` calls `VerdictSchema.parse()` and `FindingSchema.parse()` on each finding; `StageOutput` interface typed; orchestrator persists to DB with full schema |
| 3 | The AI can only read files within the cloned repository -- symlink traversal and path escape attempts are blocked | VERIFIED (code) / DOCUMENTATION GAP | `sandbox.ts` uses `realpathSync` before prefix check; clone removes symlinks via `find -type l -delete`; 6 sandbox tests pass including path-traversal and symlink tests. PIPE-04 incorrectly shows as "Pending" in REQUIREMENTS.md |
| 4 | Pipeline status is persisted as RUNNING before stages begin, enabling crash recovery detection | VERIFIED | `orchestrator.ts` line 46-49: `db.update(pipelineRuns).set({ status: 'RUNNING' })` executed synchronously before try block; orchestrator test "sets RUNNING status before stages begin" passes |
| 5 | Each stage has its own dedicated prompt file and runs an independent Claude tool_use conversation | VERIFIED | 5 prompt files in `packages/api/src/pipeline/prompts/` (ceo, eng, design, qa, security); `runStage` loads prompt via `readFileSync` at execution time; 20 prompt tests pass |

**Score:** 4/5 truths fully verified (Truth 3 verified in code, documentation gap only)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/pipeline/sandbox.ts` | Path validation with realpathSync before prefix check | VERIFIED | Exports `validatePath`; `realpathSync` called on line 21 before `startsWith` check on line 26 |
| `packages/api/src/pipeline/tools.ts` | Claude tool definitions and executor | VERIFIED | Exports `createSandboxTools`, `executeTool`; uses `execFileSync` (not `execSync`) for grep; imports `validatePath` from `./sandbox` |
| `packages/api/src/pipeline/clone.ts` | Shallow clone with symlink removal and cleanup | VERIFIED | Exports `cloneRepo`, `cleanupClone`; depth-1 single-branch clone; `execFileSync('find', ['.', '-type', 'l', '-delete'])` removes symlinks; `mkdtemp` creates `/tmp` dirs |
| `packages/api/src/pipeline/filter.ts` | Smart stage filtering for CEO/Design stages | VERIFIED | Exports `shouldRunStage`; eng/qa/security always true; ceo conditional on new files/deps/arch/size; design conditional on CSS/TSX/component files |
| `packages/api/src/pipeline/prompts/ceo.md` | CEO stage instructions - strategic product review | VERIFIED | 1,746 words (exceeds 1,500 minimum for Opus cache); contains verdict, findings, PASS/FLAG/BLOCK definitions; "premise" keyword present |
| `packages/api/src/pipeline/prompts/eng.md` | Engineering stage instructions | VERIFIED | 1,487 words (exceeds 1,000 minimum for Sonnet cache); contains verdict, findings, performance, maintainability |
| `packages/api/src/pipeline/prompts/design.md` | Design stage instructions | VERIFIED | 1,716 words (exceeds 1,000 minimum); contains verdict, findings, accessibility |
| `packages/api/src/pipeline/prompts/qa.md` | QA stage instructions | VERIFIED | 1,922 words (exceeds 1,000 minimum); contains verdict, findings, coverage |
| `packages/api/src/pipeline/prompts/security.md` | Security stage instructions | VERIFIED | 1,928 words (exceeds 1,500 minimum for Opus cache); contains verdict, findings, injection, xss |
| `packages/api/src/pipeline/stage-runner.ts` | Single stage executor with Claude API tool_use loop | VERIFIED | Exports `runStage`, `runStageWithRetry`; `MODEL_MAP` with Opus for ceo/security, Sonnet for eng/design/qa; `MAX_ITERATIONS = 25`; `AbortController` 5-min timeout; `cache_control: ephemeral` on system and last tool |
| `packages/api/src/pipeline/orchestrator.ts` | Pipeline lifecycle manager | VERIFIED | Exports `executePipeline`; RUNNING before try block; `Promise.allSettled`; fan-in with DB persistence; `cleanupClone` in finally block |
| `packages/api/src/github/handlers.ts` | PR event handler dispatching pipeline | VERIFIED | Imports `executePipeline` from `../pipeline/orchestrator`; calls fire-and-forget on line 173 with `.catch` error handling; old TODO comment removed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `handlers.ts` | `orchestrator.ts` | `import executePipeline`, called on PR webhook | WIRED | Line 6: import; line 173: `executePipeline({...}).catch(...)` -- no await (fire-and-forget) |
| `orchestrator.ts` | `stage-runner.ts` | `import runStageWithRetry`, called per stage | WIRED | Line 6: import; line 114: called in `Promise.allSettled` map |
| `orchestrator.ts` | `clone.ts` | `import cloneRepo` and `cleanupClone` | WIRED | Line 5: import; line 88: `cloneRepo(...)` call; line 219: `cleanupClone(clonePath)` in finally |
| `orchestrator.ts` | `filter.ts` | `import shouldRunStage` for CEO/Design filtering | WIRED | Line 7: import; line 78: `shouldRunStage(stage, mappedFiles)` |
| `stage-runner.ts` | `tools.ts` | `import createSandboxTools` and `executeTool` | WIRED | Line 7: import; line 188: `createSandboxTools(input.clonePath)`; line 244: `executeTool(...)` |
| `stage-runner.ts` | `prompts/*.md` | `readFileSync` to load stage instructions | WIRED | Line 182-185: `readFileSync(resolve(__dirname, 'prompts', input.stage + '.md'))` with ESM-compatible path resolution |
| `tools.ts` | `sandbox.ts` | `import validatePath` | WIRED | Line 4: import; lines 87, 99: `validatePath(...)` called before every file operation |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `orchestrator.ts` | `prFiles` | `octokit.pulls.listFiles({owner, repo, pull_number})` | Yes -- live GitHub API call | FLOWING |
| `orchestrator.ts` | `clonePath` | `cloneRepo(installationId, repoFullName, headRef)` | Yes -- real `/tmp` directory creation + git clone | FLOWING |
| `orchestrator.ts` | `results` (stage outputs) | `Promise.allSettled(stagesToRun.map(runStageWithRetry))` | Yes -- real Claude API calls (mocked in tests) | FLOWING |
| `orchestrator.ts` | DB persistence | `db.update/insert` calls after fan-in | Yes -- writes to SQLite via drizzle | FLOWING |
| `stage-runner.ts` | `stageInstructions` | `readFileSync(prompts/${stage}.md)` | Yes -- real file read from 5 prompt files | FLOWING |
| `stage-runner.ts` | `response` | `anthropic.messages.create({...})` with tool_use loop | Yes -- real Claude API (mocked in tests, real in production) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 76 tests pass | `npm run test` | 76 tests passed across 8 test files | PASS |
| TypeScript compiles without errors | `npx tsc --noEmit -p packages/api/tsconfig.json` | Exit code 0, no errors | PASS |
| Path traversal blocked | sandbox.test.ts: "throws 'Access denied' for path traversal" | PASS (in test suite) | PASS |
| tool_use loop executes and retries | stage-runner.test.ts: "handles tool_use loop", "returns FLAG on API failure" | PASS (8 stage-runner tests) | PASS |
| Orchestrator lifecycle complete | orchestrator.test.ts: RUNNING, COMPLETED, FAILED, cleanup | PASS (9 orchestrator tests) | PASS |
| Filter logic correct | filter.test.ts: all 5 stages, CEO/Design conditions, large PRs | PASS (12 filter tests) | PASS |
| Prompts meet caching minimum | prompts.test.ts: word count checks for all 5 stages | PASS (20 prompt tests) | PASS |
| Real pipeline wiring (live API) | Cannot test without ANTHROPIC_API_KEY and live GitHub App | N/A | SKIP (human verification) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| PIPE-01 | 02-03 | PR webhook triggers 5-stage cognitive review pipeline | SATISFIED | `handlers.ts` calls `executePipeline` on PR open/sync/reopen; orchestrator fans out to all 5 stages |
| PIPE-02 | 02-03 | All 5 stages execute in parallel via Promise.allSettled | SATISFIED | `orchestrator.ts` line 112: `await Promise.allSettled(stagesToRun.map(...))` |
| PIPE-03 | 02-01 | Each stage runs Claude API with tool_use (read_file, list_files, search_code) | SATISFIED | `tools.ts` defines 3 tools; `stage-runner.ts` implements tool_use loop; `executeTool` in sandbox |
| PIPE-04 | 02-01 | Shallow clone of repository to /tmp with strict path + symlink sandboxing | SATISFIED (code) / DOCUMENTATION GAP | `clone.ts`: depth-1 clone to `mkdtemp(tmpdir())`, symlinks removed via `find -type l -delete`; `sandbox.ts`: `realpathSync` prevents escape; REQUIREMENTS.md still shows `[ ]` Pending |
| PIPE-05 | 02-03 | Each stage produces structured findings with typed Zod schema | SATISFIED | `FindingSchema.parse()` in `parseStageOutput`; `StageOutput.findings: Finding[]` type; DB schema persists all finding fields |
| PIPE-06 | 02-03 | Each stage assigns a verdict: PASS, FLAG, BLOCK, or SKIP | SATISFIED | `VerdictSchema.parse()` validates verdict; SKIP assigned by orchestrator for filtered stages; FLAG is the error fallback |
| PIPE-07 | 02-02 | Dedicated prompt file per stage | SATISFIED | 5 files in `packages/api/src/pipeline/prompts/`; loaded at runtime via `readFileSync` |
| PIPE-08 | 02-01, 02-03 | Pipeline completes review in under 5 minutes | SATISFIED | `STAGE_TIMEOUT_MS = 5 * 60 * 1000` enforced via `AbortController`; stages run in parallel so total = slowest stage, not sum |
| PIPE-09 | 02-03 | Pipeline persists RUNNING status before stages begin | SATISFIED | `db.update(pipelineRuns).set({ status: 'RUNNING' })` at line 46, before the try block, before any stage work |

**Orphaned requirements check:** No PIPE-* requirements are mapped to Phase 2 in REQUIREMENTS.md that do not appear in at least one plan's `requirements` field. Coverage is complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 23, 135 | PIPE-04 marked `[ ]`/`Pending` despite complete implementation | Info | Documentation only -- no code impact. Implementation is correct and tested. |

No anti-patterns found in source code files. No TODO/FIXME comments, no stub implementations, no empty handlers, no hardcoded empty data in any of the 7 pipeline modules.

### Human Verification Required

**1. End-to-end pipeline execution with real API**

**Test:** With `ANTHROPIC_API_KEY` set, open a PR on a connected repository and observe server logs.
**Expected:** Log output shows `Pipeline RUNNING`, `Stage filtering complete`, `Stage completed` for each stage, `Pipeline COMPLETED`. Pipeline run record in DB transitions PENDING -> RUNNING -> COMPLETED. Stage results and findings rows appear in DB.
**Why human:** Requires live GitHub App installation, real Anthropic API key, and a real PR event. Cannot execute in unit test environment.

**2. Prompt caching activation for Opus stages**

**Test:** Observe `cache_read_input_tokens` in Claude API response usage for CEO and Security stages on the second PR review in a session.
**Expected:** Cache hit reported in Anthropic API response, reducing effective token cost for prompt.
**Why human:** Requires real Claude API call and observing response metadata. Anthropic SDK mock in tests does not validate cache behavior.

**3. Sandbox escape prevention under real filesystem**

**Test:** With a real clone path, attempt to create a symlink within the clone pointing outside the sandbox, then call `read_file` with that symlink path.
**Expected:** `validatePath` resolves the symlink via `realpathSync` and throws "Access denied: path escapes sandbox".
**Why human:** The sandbox tests cover this with a real temp directory, but production symlinks may involve different OS behaviors (e.g., macOS /var -> /private/var alias). The test setup already handles this with `realpathSync` on `tmpDir` itself.

---

### Gaps Summary

**One gap found, documentation-only:**

PIPE-04 (shallow clone + path sandboxing) is fully implemented in `clone.ts` and `sandbox.ts`, with 6 dedicated tests covering path traversal, symlink escape, and file-not-found cases. The implementation was completed in plan 02-01 and is correctly listed in `02-01-SUMMARY.md` under `requirements-completed: [PIPE-03, PIPE-04, PIPE-08]`.

However, `.planning/REQUIREMENTS.md` was not updated after plan execution -- PIPE-04 still shows `- [ ]` in the checkbox list and `Pending` in the traceability table. This is a documentation tracking issue, not a code gap.

**Fix required:** Update REQUIREMENTS.md lines 23 and 135 to mark PIPE-04 as complete.

The phase goal is substantively achieved: the pipeline engine is fully wired from PR webhook through to structured findings in the database, with security sandboxing, parallel execution, smart filtering, and crash-recovery status tracking all implemented and tested.

---

_Verified: 2026-03-30T18:41:00Z_
_Verifier: Claude (gsd-verifier)_
