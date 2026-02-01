# Phase 0 Code Review & Streamlining Prompt

Use this prompt in a new Claude Code session to evaluate and improve the Phase 0 implementation before merging to main.

---

## Context

You are reviewing a feature branch `feature/phase0-code-foundation` in the Mission Control project. This branch implements the foundational monorepo infrastructure for a multi-node AI orchestration system.

**Working Directory:** `/Users/root1/mission-control-phase0` (git worktree)
**Target Branch:** `main`
**Main Worktree:** `/Users/root1/mission-control`

## What Was Built

Phase 0 implements 5 packages in a pnpm/turbo monorepo:

1. **@mission-control/shared** - Core Zod schemas, TypeScript types, utilities
2. **@mission-control/hub** - Fastify orchestration server (port 3000) with security pipeline
3. **@mission-control/worker** - Cloudflare Worker public entry point with rate limiting
4. **@mission-control/compute** - Mac node task executor with sandbox enforcement
5. **@mission-control/convex** - Real-time coordination database (Convex)

## Your Task

Review the implementation for quality, consistency, and production-readiness. Provide **incremental streamlining improvements** - small, focused changes that improve the codebase without major refactoring.

### Review Checklist

1. **Type Safety**
   - Are there any `any` types that slipped through?
   - Are Zod schemas properly inferred to TypeScript types?
   - Are function signatures fully typed?

2. **Error Handling**
   - Are errors consistently using ERROR_CODES from shared?
   - Are async operations properly try/caught?
   - Are error messages helpful for debugging?

3. **Code Consistency**
   - Do all packages follow the same patterns?
   - Are imports organized consistently?
   - Is naming consistent (camelCase functions, PascalCase types)?

4. **Security Review**
   - Does sanitizer.ts cover all OWASP top 10 injection patterns?
   - Is the command allowlist in sandbox.ts complete but minimal?
   - Are there any hardcoded secrets or credentials?

5. **Dead Code**
   - Are there unused imports?
   - Are there unused exports?
   - Are there commented-out code blocks?

6. **Documentation**
   - Do exported functions have JSDoc comments?
   - Are complex algorithms explained?
   - Are TODO comments actionable?

7. **Test Readiness**
   - Are functions pure where possible (easier to test)?
   - Are dependencies injectable?
   - Are there clear boundaries between units?

### Improvement Categories

Make improvements in these categories, committing each as a separate atomic commit:

```
fix(scope): correct specific bug or issue
refactor(scope): improve code without changing behavior
style(scope): formatting, import organization
docs(scope): add/improve documentation
chore(scope): update configs, dependencies
```

### Commands to Run

```bash
# Navigate to worktree
cd /Users/root1/mission-control-phase0

# Verify current state
pnpm install
pnpm typecheck
pnpm build

# View the commits to review
git log --oneline main..HEAD

# After making improvements
git status
git diff
```

### Constraints

- **No major refactoring** - Only incremental improvements
- **Preserve all functionality** - Build must pass after each commit
- **Atomic commits** - One logical change per commit
- **No new features** - Focus on quality of existing code

### Output Format

After review, provide:

1. **Summary of Findings** - Issues discovered during review
2. **Improvements Made** - List of commits with descriptions
3. **Remaining TODOs** - Items for future phases
4. **Merge Recommendation** - Ready to merge or needs more work

---

## Start Review

Begin by reading the CLAUDE.md for project conventions, then systematically review each package starting with `packages/shared/src/`. Make improvements as you find issues, committing each fix separately.
