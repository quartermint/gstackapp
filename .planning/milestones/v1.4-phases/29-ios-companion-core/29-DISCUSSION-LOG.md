# Phase 29: iOS Companion Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-21
**Phase:** 29-ios-companion-core
**Areas discussed:** Share sheet flow, iOS layout, Sync UX, Tailscale handling

---

## Share Sheet Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal confirm (Recommended) | Brief slide-up: content preview + optional project picker + Save button. Dismisses in 1 tap. Like sharing to Notes. | ✓ |
| Inline edit | Slide-up with editable text field, project picker, tags. More control, more friction. | |
| Silent capture | No UI — content captured silently with haptic. Zero friction but no project assignment. | |

**User's choice:** Minimal confirm
**Notes:** Like sharing to Notes or Reminders — familiar iOS pattern.

---

## iOS Dashboard Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Simple list with health dots (Recommended) | Scrollable list grouped by Active/Idle/Stale. Row: name, health dot, last commit, capture count. Pull-to-refresh. | ✓ |
| Card grid | 2-column grid of project cards. More visual but denser. | |
| Tab-based | Separate tabs for Projects/Captures/Risks. Standard iOS but fragments glanceable view. | |

**User's choice:** Simple list with health dots
**Notes:** Like Apple Health summary cards — glanceable, clean.

---

## Sync UX

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle banner + count (Recommended) | Small banner: "☁️ 3 captures pending sync" when offline. Badge on app icon. Animates away on sync. | ✓ |
| Per-capture status | Each capture shows sync status. More granular but clutters list. | |
| Sync page | Dedicated sync status screen. Most detailed but over-engineered for ≤5 items. | |

**User's choice:** Subtle banner + count
**Notes:** Non-intrusive, with app icon badge for ambient awareness.

---

## Tailscale Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Passive indicator + deep link (Recommended) | Status bar: "Offline — connect to Tailscale" with tap-to-open. Captures still work offline. No blocking modals. | ✓ |
| Blocking modal on launch | Full-screen prompt if disconnected. Forces awareness but blocks offline features. | |
| Silent fallback | No prompt. App works offline, syncs when connected. Simplest but user may not notice. | |

**User's choice:** Passive indicator + deep link
**Notes:** Captures always work. Tailscale prompt is informational, not blocking.

---

## Claude's Discretion

- SwiftUI layout and styling
- Core Data schema
- App Group container naming
- Network reachability approach

## Deferred Ideas

- iOS background sync — foreground sufficient for v1.4
- Push notifications — pull-based by design
- Screenshot OCR — Vision framework deferred
- Camera/whiteboard capture — out of scope
