# Phase 28: Dashboard Highlight Mode - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-21
**Phase:** 28-dashboard-highlight-mode
**Areas discussed:** Highlight visual, Summary placement, Persistence

---

## Highlight Visual Treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Left accent bar (Recommended) | Subtle 3px left border in terracotta/indigo on changed project rows. Doesn't compete with health dots or badges. | ✓ |
| Background glow | Warm background tint on changed rows. More visible but may clash with dark mode. | |
| New badge | Small 'NEW' or activity count badge next to project name. Adds to existing badge density. | |

**User's choice:** Left accent bar
**Notes:** Subtle, doesn't compete with existing visual elements.

---

## Summary Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Top strip (Recommended) | Add to existing top strip alongside discovery/star badges. Already the ambient awareness zone. | ✓ |
| Hero card subtitle | Show in hero card area. Prominent but ties to featured project. | |
| Floating pill | Small floating badge in top-right. Always visible but new UI pattern. | |

**User's choice:** Top strip
**Notes:** Consistent with existing ambient awareness zone.

---

## Highlight Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Clear on scroll/interaction (Recommended) | Highlights clear once user scrolls past or clicks highlighted project. Natural behavior. | ✓ |
| Clear after time delay | Highlights fade after 30-60 seconds. Simpler but might miss things. | |
| Manual dismiss | Persist until 'Mark all read' action. Most explicit but adds friction. | |

**User's choice:** Clear on scroll/interaction
**Notes:** Natural "I've seen this" behavior.

---

## Claude's Discretion

- Exact accent bar color token
- Float-to-top animation
- Scroll detection implementation
- Visit tracking API design

## Deferred Ideas

None
