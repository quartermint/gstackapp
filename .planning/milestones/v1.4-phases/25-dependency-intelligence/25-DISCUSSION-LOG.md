# Phase 25: Dependency Intelligence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-21
**Phase:** 25-dependency-intelligence
**Areas discussed:** Dependency badges, Drift rules, Cross-machine reconciliation

---

## Dependency Badges

| Option | Description | Selected |
|--------|-------------|----------|
| Small pills (Recommended) | Compact pill badges (like HostBadge) showing dependency project names. Consistent with existing badge patterns. Collapse to '+N more' if >3 deps. | ✓ |
| Icon + count only | Single dependency icon with count. Click to expand full list. Minimal card clutter. | |
| Inline text | Text line under project name. Simple but takes vertical space. | |

**User's choice:** Small pills
**Notes:** Consistent with HostBadge pattern.

---

## Drift Rules

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded thresholds (Recommended) | 24h → warning, 7d → critical. Matches requirements exactly. Simple. | ✓ |
| Config-driven thresholds | Customizable hour thresholds. More flexible but adds config surface. | |

**User's choice:** Hardcoded thresholds
**Notes:** Keep it simple. Can add config later.

---

## Cross-Machine Reconciliation

| Option | Description | Selected |
|--------|-------------|----------|
| Piggyback on scan cycle (Recommended) | After scanning both machines, compare head commits of dependency pairs. Uses existing scan data. | ✓ |
| Dedicated reconciliation pass | Separate timer for dependency checks. More granular but adds another scheduled task. | |

**User's choice:** Piggyback on scan cycle
**Notes:** No new SSH calls or timers.

---

## Claude's Discretion

- Pill badge styling and colors
- Drift detection algorithm details
- Health finding message format
- Severity escalation timer implementation

## Deferred Ideas

None
