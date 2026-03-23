---
phase: 30-ios-extended
plan: 02
subsystem: ios
tags: [avfoundation, sfspeechrecognizer, swiftui, voice-capture, audio-recording, transcription]

# Dependency graph
requires:
  - phase: 30-ios-extended/01
    provides: "Widget extension, QuickCaptureView, project structure"
  - phase: 29-ios-companion-core
    provides: "QueuedCapture model, SyncEngine, DashboardView, MCAPIClient, App Group container"
provides:
  - "AudioRecorderService wrapping AVAudioRecorder with .m4a recording and metering"
  - "TranscriptionService with SFSpeechRecognizer 55-second chunking"
  - "VoiceCaptureViewModel orchestrating recording + transcription + permission flow"
  - "VoiceRecordingView with live waveform visualization and elapsed timer"
  - "VoicePreviewView with transcription preview and re-record/save options"
  - "VoiceCaptureView state machine (idle -> recording -> preview)"
  - "QueuedCapture extended with audioFilePath, transcriptionText, audioDuration"
  - "SyncEngine voice type handling (transcription as rawContent)"
  - "Dashboard mic button for voice capture entry"
affects: [ios-companion]

# Tech tracking
tech-stack:
  added: [AVFoundation, Speech framework]
  patterns: [55-second speech chunking, audio metering waveform, state machine view model]

key-files:
  created:
    - "~/mission-control-ios/MissionControl/Services/AudioRecorderService.swift"
    - "~/mission-control-ios/MissionControl/Services/TranscriptionService.swift"
    - "~/mission-control-ios/MissionControl/ViewModels/VoiceCaptureViewModel.swift"
    - "~/mission-control-ios/MissionControl/Views/VoiceCaptureView.swift"
    - "~/mission-control-ios/MissionControl/Views/VoiceRecordingView.swift"
    - "~/mission-control-ios/MissionControl/Views/VoicePreviewView.swift"
    - "~/mission-control-ios/MissionControlTests/AudioRecorderServiceTests.swift"
    - "~/mission-control-ios/MissionControlTests/TranscriptionServiceTests.swift"
    - "~/mission-control-ios/MissionControlTests/VoiceCaptureTests.swift"
  modified:
    - "~/mission-control-ios/Shared/QueuedCapture.swift"
    - "~/mission-control-ios/MissionControl/Services/SyncEngine.swift"
    - "~/mission-control-ios/MissionControl/Views/DashboardView.swift"
    - "~/mission-control-ios/MissionControl/Info.plist"
    - "~/mission-control-ios/project.yml"
    - "~/mission-control-ios/MissionControlTests/Mocks/MockMCAPIClient.swift"

key-decisions:
  - "AVAudioRecorder with metering over AVAudioEngine (simpler for recording + level data)"
  - "55-second chunk timer with 5-second safety margin before 60-second SFSpeechRecognizer limit"
  - "On-device transcription preferred (requiresOnDeviceRecognition) with fallback to server"
  - "Audio file stored in App Group container under AudioCaptures/ with UUID filename"
  - "Relative path stored in QueuedCapture (not absolute) for portability"
  - "Voice captures sync with transcriptionText as rawContent (text-only API sync for v1.4)"
  - "MockMCAPIClient uses withLock instead of lock/unlock for Swift 6 async safety"

patterns-established:
  - "State machine ViewModel pattern: VoiceCaptureViewModel.State enum (idle/recording/preview) drives view switching"
  - "WaveformView: rolling array of 30 audio levels with onChange animation"
  - "55-second chunk restart: invalidate timer, stop engine, endAudio, brief delay, startNewChunk"

requirements-completed: [IOS-05, IOS-06]

# Metrics
duration: 7min
completed: 2026-03-23
---

# Phase 30 Plan 02: Voice Capture Summary

**Voice recording with AVAudioRecorder metering, live waveform visualization, and SFSpeechRecognizer transcription with 55-second chunking for unlimited-duration capture**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-23T00:37:31Z
- **Completed:** 2026-03-23T00:44:46Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- AudioRecorderService records .m4a to App Group container with 20Hz metering for live waveform
- TranscriptionService chunks SFSpeechRecognizer at 55-second intervals for unlimited recording duration
- Full voice capture UI flow: idle (permission check) -> recording (timer + waveform + live transcription) -> preview (transcription + re-record/save)
- QueuedCapture model extended with audioFilePath, transcriptionText, audioDuration (backward compatible via optional fields)
- SyncEngine sends voice captures with transcription as rawContent to MC API
- Dashboard mic button provides single-tap entry to voice capture

## Task Commits

Each task was committed atomically:

1. **Task 1: AudioRecorderService, TranscriptionService, QueuedCapture extension, tests** - `398f645` (feat)
2. **Task 2: VoiceCaptureViewModel, recording views, dashboard wiring** - `3e9eae2` (feat)

## Files Created/Modified
- `~/mission-control-ios/MissionControl/Services/AudioRecorderService.swift` - AVAudioRecorder wrapper with .m4a recording and 20Hz metering
- `~/mission-control-ios/MissionControl/Services/TranscriptionService.swift` - SFSpeechRecognizer with 55-second chunking and on-device recognition
- `~/mission-control-ios/MissionControl/ViewModels/VoiceCaptureViewModel.swift` - Orchestrates recording + transcription with permission handling
- `~/mission-control-ios/MissionControl/Views/VoiceCaptureView.swift` - State-switching container for voice capture flow
- `~/mission-control-ios/MissionControl/Views/VoiceRecordingView.swift` - Recording UI with WaveformView, timer, live transcription, and stop button
- `~/mission-control-ios/MissionControl/Views/VoicePreviewView.swift` - Post-recording transcription preview with re-record and save actions
- `~/mission-control-ios/Shared/QueuedCapture.swift` - Extended with audioFilePath, transcriptionText, audioDuration optional fields
- `~/mission-control-ios/MissionControl/Services/SyncEngine.swift` - Voice captures send transcriptionText as rawContent
- `~/mission-control-ios/MissionControl/Views/DashboardView.swift` - Added mic.fill toolbar button and voice capture sheet
- `~/mission-control-ios/MissionControl/Info.plist` - Added NSMicrophoneUsageDescription and NSSpeechRecognitionUsageDescription
- `~/mission-control-ios/project.yml` - Added mic and speech permission strings
- `~/mission-control-ios/MissionControlTests/AudioRecorderServiceTests.swift` - Initial state and path construction tests
- `~/mission-control-ios/MissionControlTests/TranscriptionServiceTests.swift` - Initial state, empty transcription, reset tests
- `~/mission-control-ios/MissionControlTests/VoiceCaptureTests.swift` - Voice capture creation, optional fields, sync content selection tests
- `~/mission-control-ios/MissionControlTests/Mocks/MockMCAPIClient.swift` - Updated to use withLock for Swift 6 async safety

## Decisions Made
- AVAudioRecorder with metering chosen over AVAudioEngine for simplicity -- metering provides sufficient level data for waveform visualization without the complexity of audio graph management
- 55-second chunk timer provides 5-second safety margin before SFSpeechRecognizer's hard 60-second limit, preventing silent recognition failures
- On-device transcription preferred for privacy (requiresOnDeviceRecognition when supported), with server fallback for broader device compatibility
- Relative audio file paths stored in QueuedCapture (strip App Group container prefix) for portability across container path changes
- Voice captures sync text-only to MC API (transcription as rawContent) -- audio file stays local per v1.4 API contract

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed MockMCAPIClient Swift 6 async safety**
- **Found during:** Task 1 (build verification)
- **Issue:** NSLock.lock()/unlock() calls rejected by Swift 6 strict concurrency in async contexts on iOS 18.6
- **Fix:** Replaced manual lock()/unlock() with withLock {} closure pattern (preserves NSLock as instructed)
- **Files modified:** MissionControlTests/Mocks/MockMCAPIClient.swift
- **Verification:** All 40 tests pass, 0 failures
- **Committed in:** 398f645 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Pre-existing Swift 6 compatibility issue in test mock. Fix was necessary for any build to succeed. No scope creep.

## Issues Encountered
- iPhone 16 Pro simulator name format mismatch -- used simulator UUID directly instead of name string for reliable destination targeting

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all voice capture functionality is fully wired: recording saves to App Group container, transcription stitches chunks, SyncEngine sends voice type to API, dashboard provides entry point.

## Next Phase Readiness
- Voice capture is fully integrated into the iOS companion app
- Phase 30 (ios-extended) is now complete -- both widget (30-01) and voice capture (30-02) plans shipped
- All 40 tests pass, build succeeds on iOS 18.6 simulator

## Self-Check: PASSED

- All 9 created files verified on disk
- Both commits (398f645, 3e9eae2) verified in git log
- All 24 acceptance criteria pass
- 40/40 tests pass with 0 failures

---
*Phase: 30-ios-extended*
*Completed: 2026-03-23*
