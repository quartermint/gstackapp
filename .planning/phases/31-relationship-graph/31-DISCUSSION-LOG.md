# Phase 31: Relationship Graph - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-21
**Phase:** 31-relationship-graph
**Areas discussed:** Interaction model, Node density

---

## Interaction Model

| Option | Description | Selected |
|--------|-------------|----------|
| Hover details + click focus (Recommended) | Hover: tooltip with name, health, dep count. Click: highlights dependency chain, dims unrelated. Drag to rearrange. Zoom/pan. | ✓ |
| Click-only details | Click node for side panel with full details. No hover. Cleaner but slower exploration. | |
| Static overview | Non-interactive rendered graph. Simplest but least useful for exploration. | |

**User's choice:** Hover details + click focus
**Notes:** Full interactive model with hover tooltips, click-to-focus chains, and drag/zoom.

---

## Node Information Density

| Option | Description | Selected |
|--------|-------------|----------|
| Name + health dot (Recommended) | Node shows project name and colored health dot. Host indicated by border color. Minimal, clean. | ✓ |
| Name + health + host badge | Includes project name, health dot, and host indicator. Nodes get larger. | |
| Name only | Just names, colored by status. Cleanest but requires hover for any detail. | |

**User's choice:** Name + health dot
**Notes:** Host differentiation via border color, not separate badge.

---

## Claude's Discretion

- D3-force simulation parameters
- Edge styling
- Tooltip design
- Container sizing
- Host color palette

## Deferred Ideas

None
