---
phase: 30
slug: ios-extended
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | XCTest (via XcodeGen + xcodebuild) |
| **Config file** | ~/mission-control-ios/project.yml |
| **Quick run command** | `cd ~/mission-control-ios && xcodegen generate && xcodebuild test -project MissionControl.xcodeproj -scheme MissionControlTests -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet` |
| **Full suite command** | `cd ~/mission-control-ios && xcodegen generate && xcodebuild test -project MissionControl.xcodeproj -scheme MissionControlTests -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick test command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | IOS-03 | unit | `xcodebuild test --filter QuickCaptureTests` | ❌ W0 | ⬜ pending |
| 30-01-02 | 01 | 1 | IOS-04 | manual | Widget interaction in simulator | ❌ W0 | ⬜ pending |
| 30-02-01 | 02 | 2 | IOS-05 | unit | `xcodebuild test --filter VoiceCaptureTests` | ❌ W0 | ⬜ pending |
| 30-02-02 | 02 | 2 | IOS-06 | unit | `xcodebuild test --filter TranscriptionTests` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test files created alongside implementation (no separate Wave 0)
- [ ] XcodeGen project.yml updated with widget extension target

*Note: This extends the existing iOS project from Phase 29 — test infrastructure already exists.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Widget appears on home screen | IOS-03 | Requires simulator widget gallery interaction | Add widget → verify "MC Quick Capture" appears in widget gallery |
| Widget tap opens app to capture view | IOS-04 | Requires widget interaction + app launch | Tap widget → verify app opens to QuickCaptureView with focused TextField |
| Voice recording with waveform display | IOS-05 | Requires microphone access on device | Open voice capture → grant mic permission → verify timer and waveform |
| Transcription chunking at 60s | IOS-06 | Requires extended recording session | Record >60s → verify transcription stitches across chunk boundaries |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
