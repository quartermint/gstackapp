---
plan: 03-02
phase: 03-review-output-signal-quality
status: complete
started: 2026-03-30T22:00:00Z
completed: 2026-03-30T22:10:00Z
---

# Plan 03-02: Inline Review Comments & Feedback API

## Result

**Status:** Complete
**Tasks:** 2/2
**Tests:** 24 new tests (139 total across 12 files)

## What was built

### Task 1: Inline Review Comment Mapper
- **inline-review.ts** — Diff line parser (buildDiffLineMap), finding-to-comment mapper (mapFindingsToInlineComments), batched createReview caller
- Parses unified diff format, validates findings against actual diff lines (prevents 422 errors)
- Only Tier 1+2 findings get inline comments, capped at 15 per rate limit safety
- Each comment includes stage identity label (🟠 CEO, 🔵 Eng, etc.)
- Uses `line`/`side: RIGHT` parameters (not deprecated `position`)
- 15 tests covering diff parsing, filtering, capping, and API call verification

### Task 2: Feedback API & Reaction Polling
- **feedback.ts route** — POST /api/feedback with Zod validation, 400/404/200 responses, stores vote+note+source+timestamp
- **syncReactionFeedback** — Polls GitHub reactions on inline comments, updates findings with thumbsUp/thumbsDown votes
- Route mounted at /api/feedback in index.ts
- 9 tests covering API validation, storage, overwrite, reaction polling, 404 graceful handling

## Requirement Coverage

| Req | Description | How |
|-----|-------------|-----|
| REVW-04 | Inline PR review comments | inline-review.ts with diff validation + batched createReview |
| SGNL-02 | Thumbs up/down feedback | POST /api/feedback endpoint + syncReactionFeedback |
| SGNL-03 | Feedback stored for improvement | findings table feedbackVote/Note/Source/At columns |

## Key Files

### Created
- `packages/api/src/github/inline-review.ts`
- `packages/api/src/routes/feedback.ts`
- `packages/api/src/__tests__/inline-review.test.ts`
- `packages/api/src/__tests__/feedback.test.ts`

### Modified
- `packages/api/src/github/comment.ts` (added syncReactionFeedback)
- `packages/api/src/index.ts` (mounted feedback route)
