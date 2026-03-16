# Phase 13 Context: LM Gateway + Budget

**Created:** 2026-03-16
**Phase Goal:** MC knows whether the local LM Studio model is available and tracks session costs by model tier, providing budget awareness and routing suggestions

## Decisions

### Budget Display
- **Show session counts + burn rate indicator, NO dollar estimates**
- Weekly view: "5 Opus / 12 Sonnet / 3 Local" with a visual burn rate (low/moderate/hot)
- Burn rate is relative to a configurable weekly threshold (e.g., 20 Opus sessions/week = "hot")
- No dollar amounts until real billing data is available for calibration
- All budget data is informational — never blocks, restricts, or gates sessions

### Budget Placement
- **Dashboard widget** — passive awareness when viewing MC, always visible
- **Hook response banner** — active decision support at Claude Code session start
  - SessionStart hook response includes budget context: "Week: 15 Opus sessions (moderate). Consider Sonnet for routine tasks."
  - Only fires when burn rate exceeds "moderate" threshold — no noise when budget is healthy
  - This means the SessionStart HTTP hook response body carries budget data back to Claude Code

### Tier Routing Recommendations
- Rule-based, not AI: keyword matching on task description if available
- "architecture", "design", "complex", "plan" → suggest Opus
- "test", "fix", "refactor", "update" → suggest Sonnet
- "scaffold", "boilerplate", "template" → suggest Local
- Budget burn rate overrides: if Opus is "hot", suggest downgrading eligible tasks
- Suggestions only — never auto-route or restrict

### LM Studio Health Probe
- Poll `GET http://100.x.x.x:1234/v1/models` on 30-second timer
- Three-state health: `unavailable` (API down), `loading` (API up, no model loaded), `ready` (model in list)
- Surface in existing health panel alongside Mac Mini system metrics
- If LM Studio is unavailable, tier router should not suggest Local tier

### Budget Calculation
- Derived from sessions table: `SELECT modelTier, COUNT(*) FROM sessions WHERE startedAt > weekStart GROUP BY modelTier`
- No separate budget_entries table needed — query sessions directly
- Weekly reset based on configurable day (default: Friday, matching Claude billing cycle)

## Code Context

### Existing Patterns
- **Health monitor:** `services/health-monitor.ts` — port-check based service status, `ServiceEntry` type
- **Health routes:** `routes/health.ts` — system health endpoint
- **Health panel:** `components/health/health-panel.tsx` — dropdown with system metrics

### New Files
- `packages/api/src/services/lm-studio.ts` — LM Studio health probe
- `packages/api/src/services/budget-service.ts` — budget calculation, burn rate, routing suggestions
- `packages/api/src/routes/budget.ts` — GET /api/budget
- `packages/api/src/routes/models.ts` — GET /api/models (or merge into single route group)

### Integration Points
- Health monitor: add LM Studio as a ServiceEntry (name: "LM Studio", port: 1234, host: "100.x.x.x")
- Session start hook: query budget service for response banner data
- Consider merging sessions/budget/models into a single `createSessionRoutes()` to reduce Hono RPC type chain depth

## Deferred Ideas
- Dollar cost estimates once calibrated against real Claude billing
- Smart routing with learning from historical outcomes (v1.3+)
