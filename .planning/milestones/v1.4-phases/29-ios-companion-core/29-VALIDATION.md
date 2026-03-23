---
phase: 29
slug: ios-companion-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | XCTest (via Swift Package Manager) |
| **Config file** | Package.swift (sibling repo ~/mission-control-ios) |
| **Quick run command** | `swift test --filter MCCompanionTests` |
| **Full suite command** | `swift test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `swift test --filter MCCompanionTests`
- **After every plan wave:** Run `swift test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | IOS-07 | unit | `swift test --filter CaptureModelTests` | ❌ W0 | ⬜ pending |
| 29-01-02 | 01 | 1 | IOS-08 | unit | `swift test --filter OfflineQueueTests` | ❌ W0 | ⬜ pending |
| 29-02-01 | 02 | 1 | IOS-01 | unit | `swift test --filter ShareExtensionTests` | ❌ W0 | ⬜ pending |
| 29-02-02 | 02 | 1 | IOS-02 | manual | Memory profiler in Xcode | ❌ W0 | ⬜ pending |
| 29-03-01 | 03 | 2 | IOS-09 | unit | `swift test --filter SyncEngineTests` | ❌ W0 | ⬜ pending |
| 29-03-02 | 03 | 2 | IOS-10 | unit | `swift test --filter IdempotencyTests` | ❌ W0 | ⬜ pending |
| 29-04-01 | 04 | 2 | IOS-11 | unit | `swift test --filter ProjectListViewModelTests` | ❌ W0 | ⬜ pending |
| 29-04-02 | 04 | 2 | IOS-12 | unit | `swift test --filter HealthDotTests` | ❌ W0 | ⬜ pending |
| 29-04-03 | 04 | 2 | IOS-13 | integration | `swift test --filter CaptureFlowTests` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `Tests/MCCompanionTests/` — test directory structure
- [ ] `Package.swift` — test target configuration
- [ ] XCTest framework — included in Xcode (no install needed)

*Note: This is a greenfield iOS project — Wave 0 creates the entire test infrastructure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Share sheet appears in iOS share menu | IOS-01 | Requires physical device or simulator UI interaction | Install on simulator → open Safari → share any URL → verify MC appears in share sheet |
| Share extension memory < 120MB | IOS-02 | Requires Xcode memory profiler | Run extension under Xcode Instruments → verify peak memory < 120MB |
| Tailscale connectivity detection | IOS-09 | Requires Tailscale VPN active on device | Toggle Tailscale VPN → verify app detects online/offline state correctly |
| Sync status UI updates in real-time | IOS-11 | Requires visual verification | Create captures offline → connect → verify counter decrements as syncs complete |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
