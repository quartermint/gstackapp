# Phase 30: iOS Extended - Research

**Researched:** 2026-03-22
**Domain:** iOS WidgetKit capture, AVFoundation audio recording, SFSpeechRecognizer transcription
**Confidence:** MEDIUM

## Summary

This phase adds two major features to the mission-control-ios sibling repo: a home screen widget for quick text capture and a voice recording screen with live waveform and on-device transcription. Both features build on Phase 29's offline queue (SwiftData + App Group), sync engine, and API client.

The critical architectural finding is that **WidgetKit does NOT support text input fields**. Interactive widgets (iOS 17+) only support Button and Toggle controls via AppIntents. The "3-tap capture" flow described in CONTEXT.md (D-01 through D-04) must be implemented as: (1) tap widget button, (2) app opens to a dedicated capture text field with keyboard auto-focused, (3) type and tap send. The widget itself is a launch pad, not an inline text editor. This matches how Apple's Reminders widget works -- tapping "New Reminder" opens the app to a focused input.

Voice recording uses AVAudioRecorder for .m4a/AAC file recording and SFSpeechRecognizer for on-device transcription. The 1-minute limit on SFSpeechRecognizer per recognition request requires manual chunking: start a new recognition request every ~55 seconds, stitch transcription results, while AVAudioRecorder records continuously without interruption. The waveform visualization uses AVAudioEngine tap for real-time audio levels, rendered in SwiftUI (no external dependencies needed).

**Primary recommendation:** Widget uses AppIntent with `openAppWhenRun = true` to deep-link into a QuickCaptureView. Voice recording uses AVAudioRecorder (continuous) + SFSpeechRecognizer (chunked at 55s intervals) running in parallel, with both the transcription text and .m4a file stored in the offline queue.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Medium WidgetKit widget with text input area and send button -- like Reminders widget
- **D-02:** Tap opens inline keyboard, dictation via iOS keyboard mic button
- **D-03:** Widget writes to shared App Group offline queue within 3-second WidgetKit execution budget (IOS-04)
- **D-04:** 3-tap flow: tap widget -> type/dictate -> tap send
- **D-05:** Recording screen shows live audio waveform animation, countdown timer, and stop button
- **D-06:** No hard recording time limit -- user records until they tap stop. Transcription chunked in 60s segments via SFSpeechRecognizer.
- **D-07:** After recording: shows transcription preview with option to re-record or save
- **D-08:** Stores both transcription text and original audio file (.m4a) -- per IOS-06
- **D-09:** Transcription uses SFSpeechRecognizer (on-device). SpeechAnalyzer upgrade deferred to future milestone.

### Claude's Discretion
- Waveform visualization implementation (Core Animation vs SwiftUI)
- Audio recording format and compression settings
- Transcription chunking and stitching logic
- Widget configuration options (if any)
- Countdown timer vs elapsed timer display

### Deferred Ideas (OUT OF SCOPE)
- SpeechAnalyzer API upgrade -- deferred until iOS 26 adoption is sufficient (KNOW-F02)
- AppIntents / Shortcuts integration -- research flag noted in roadmap, validate execution budget
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IOS-03 | User can capture text in 3 taps via home screen widget (tap widget, type/dictate, send) | Widget uses AppIntent button to open app to QuickCaptureView; widget cannot embed text fields (WidgetKit limitation). 3-tap flow: tap widget -> type in app -> tap send |
| IOS-04 | Widget writes to shared offline queue within 3-second execution budget | Widget AppIntent with openAppWhenRun=true completes within budget since it only launches the app. QuickCaptureView writes to SwiftData (same as ShareView pattern). No heavy work in widget extension. |
| IOS-05 | User can record voice captures with no time limit; on-device transcription via SFSpeechRecognizer in 60s chunks | AVAudioRecorder records continuously (.m4a AAC). SFSpeechRecognizer runs parallel with requiresOnDeviceRecognition=true, restarted every ~55s to avoid 1-minute limit. Transcription chunks stitched into single string. |
| IOS-06 | Voice captures store both transcription text and audio file (.m4a) | QueuedCapture model extended with audioFilePath and transcriptionText fields. Audio file stored in App Group shared container. Sync engine uploads audio via multipart or base64 alongside transcription. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WidgetKit | iOS 17+ | Home screen widget | Apple-native, only option for iOS widgets |
| AppIntents | iOS 17+ | Widget button action + app launch | Required for interactive widgets since iOS 17 |
| AVFoundation | iOS 17+ | Audio recording (AVAudioRecorder) | Apple-native audio recording framework |
| Speech | iOS 17+ | SFSpeechRecognizer transcription | Apple-native on-device speech recognition |
| SwiftData | iOS 17+ | Shared offline queue persistence | Already used in Phase 29 for QueuedCapture |
| SwiftUI | iOS 17+ | Voice recording UI + waveform | Already used throughout the app |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Accelerate | iOS 17+ | Audio level metering (vDSP) | For waveform visualization from audio buffer data |
| AVAudioEngine | iOS 17+ | Real-time audio tap for waveform | Parallel to AVAudioRecorder for live visualization |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SwiftUI waveform | DSWaveformImage library | External dependency violates zero-dependency constraint |
| AVAudioRecorder | AVAudioEngine recording | AVAudioRecorder is simpler for file-based recording; AVAudioEngine needed only for waveform tap |
| SFSpeechRecognizer | SpeechAnalyzer (iOS 26) | Better for long audio but deferred per KNOW-F02 |

**Installation:** No external packages needed. All Apple frameworks.

## Architecture Patterns

### Recommended Project Structure
```
MissionControl/
  Views/
    QuickCaptureView.swift       # Opened from widget, text field + send
    VoiceRecordingView.swift     # Recording screen with waveform + timer
    VoicePreviewView.swift       # Post-recording transcription preview
  ViewModels/
    VoiceCaptureViewModel.swift  # Audio recording + transcription orchestration
  Services/
    AudioRecorderService.swift   # AVAudioRecorder wrapper
    TranscriptionService.swift   # SFSpeechRecognizer chunked transcription
    AudioWaveformMonitor.swift   # Real-time audio levels for waveform
CaptureWidget/
  CaptureWidget.swift            # Widget entry point
  CaptureWidgetProvider.swift    # Timeline provider
  CaptureIntent.swift            # AppIntent to open app
  CaptureWidgetBundle.swift      # Widget bundle
Shared/
  QueuedCapture.swift            # Extended with audioFilePath + transcriptionText
  SharedModelContainer.swift     # Unchanged (schema auto-migrates)
  Constants.swift                # New constants for audio settings
```

### Pattern 1: Widget-to-App Deep Link via AppIntent
**What:** Widget button triggers AppIntent with `openAppWhenRun = true`, app observes navigation state to show QuickCaptureView
**When to use:** For the 3-tap capture flow (IOS-03)
**Example:**
```swift
// In CaptureWidget extension target
struct CaptureIntent: AppIntent {
    static var title: LocalizedStringResource = "Quick Capture"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        // Set flag in App Group UserDefaults so app knows to show capture view
        UserDefaults(suiteName: AppConstants.appGroupID)?
            .set(true, forKey: "showQuickCapture")
        return .result()
    }
}

// In widget view
struct CaptureWidgetEntryView: View {
    var body: some View {
        Button(intent: CaptureIntent()) {
            VStack {
                Image(systemName: "plus.bubble")
                Text("Quick Capture")
            }
        }
    }
}

// In MissionControlApp.swift
.onOpenURL { url in /* handle deep link */ }
// OR observe UserDefaults change
.onChange(of: scenePhase) { _, newPhase in
    if newPhase == .active {
        checkForQuickCapture()
    }
}
```

### Pattern 2: Parallel Audio Recording + Transcription
**What:** AVAudioRecorder records continuously to .m4a file while SFSpeechRecognizer transcribes in parallel via AVAudioEngine tap, restarting every ~55s
**When to use:** Voice capture (IOS-05)
**Example:**
```swift
// AudioRecorderService records to file
let settings: [String: Any] = [
    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
    AVSampleRateKey: 44100,
    AVNumberOfChannelsKey: 1,
    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
]
let audioURL = containerURL.appendingPathComponent("\(UUID().uuidString).m4a")
audioRecorder = try AVAudioRecorder(url: audioURL, settings: settings)
audioRecorder.record()

// TranscriptionService runs in parallel
// Restarts recognition request every ~55s
// Accumulates transcribed text chunks
```

### Pattern 3: Chunked Transcription Stitching
**What:** Timer fires at ~55s intervals to end current SFSpeechRecognitionTask and start a new one. Each chunk's bestTranscription.formattedString is appended to an array.
**When to use:** Handling SFSpeechRecognizer's 1-minute per-request limit (IOS-05)
**Example:**
```swift
class TranscriptionService {
    private var chunks: [String] = []
    private var currentTask: SFSpeechRecognitionTask?
    private var chunkTimer: Timer?

    func startNewChunk() {
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = true

        currentTask = speechRecognizer.recognitionTask(with: request) { result, error in
            if let result = result, result.isFinal {
                self.chunks.append(result.bestTranscription.formattedString)
            }
        }

        // Restart before hitting 1-minute limit
        chunkTimer = Timer.scheduledTimer(withTimeInterval: 55, repeats: false) { _ in
            self.finishCurrentChunk()
            self.startNewChunk()
        }
    }

    var fullTranscription: String {
        chunks.joined(separator: " ")
    }
}
```

### Anti-Patterns to Avoid
- **Text field in widget:** WidgetKit does NOT support TextField, TextEditor, or any text input controls. Only Button and Toggle are interactive in widgets.
- **Single SFSpeechRecognizer request for long recording:** Will fail or return partial results after ~60 seconds. Must chunk.
- **AVAudioEngine for both recording and waveform:** Use AVAudioRecorder for the file recording (simpler, writes directly to .m4a) and AVAudioEngine tap ONLY for waveform visualization.
- **Networking in widget extension:** Widget extensions have severe memory and time constraints. The widget should only set a flag or write to shared storage, never make network calls.
- **Heavy processing in WidgetKit timeline provider:** Timeline provider must return quickly. No audio processing, no network calls, no database queries beyond simple reads.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio recording to .m4a | Custom AVAudioEngine file writer | AVAudioRecorder | Handles file format, compression, interruption handling out of the box |
| Speech-to-text | Custom ML model or Whisper | SFSpeechRecognizer | Apple-native, on-device, no model deployment needed |
| Audio level metering | Manual buffer math | AVAudioRecorder.averagePower(forChannel:) or AVAudioEngine tap + vDSP | Built-in metering is efficient and accurate |
| Widget → app communication | Custom IPC or shared files | AppIntent + UserDefaults in App Group | Apple's designed pattern for widget-app interaction |
| Audio format conversion | Manual audio processing | AVAudioRecorder with AAC settings | Handles encoding natively |

**Key insight:** Every component in this phase has a first-party Apple framework solution. The zero-external-dependency constraint from Phase 29 continues to hold. The complexity is in orchestrating multiple frameworks (AVAudioRecorder + AVAudioEngine + SFSpeechRecognizer) running simultaneously.

## Common Pitfalls

### Pitfall 1: Attempting Text Input in Widget
**What goes wrong:** Developer tries to embed TextField in widget view. It compiles but is non-functional -- WidgetKit strips interactive views except Button and Toggle.
**Why it happens:** CONTEXT.md D-01 says "text input area" which implies inline text entry. WidgetKit doesn't support this.
**How to avoid:** Widget has a single "Quick Capture" button (AppIntent) that opens the main app to a QuickCaptureView with auto-focused TextField. This achieves the same 3-tap UX: tap widget -> type -> tap send.
**Warning signs:** Widget renders but keyboard never appears; text field shows but is not editable.

### Pitfall 2: SFSpeechRecognizer Silent Failure After 60 Seconds
**What goes wrong:** Recognition task stops returning results after ~60 seconds with no error callback.
**Why it happens:** Apple enforces a per-request audio duration limit of approximately 1 minute. The task may end silently without calling the error handler.
**How to avoid:** Implement a timer that ends the current recognition task and starts a new one every 55 seconds (5-second safety margin). Monitor `result.isFinal` to capture the last chunk's text before restarting.
**Warning signs:** Transcription text stops updating while recording continues; `isFinal` never fires.

### Pitfall 3: Audio Session Category Conflicts
**What goes wrong:** AVAudioRecorder and SFSpeechRecognizer both need the audio session, and setting it up wrong causes one to fail silently.
**Why it happens:** AVAudioRecorder needs `.playAndRecord` or `.record` category. SFSpeechRecognizer also uses the audio session. They can coexist but the session must be configured before either starts.
**How to avoid:** Set audio session category to `.playAndRecord` with `.defaultToSpeaker` option once before starting either. Both AVAudioRecorder and SFSpeechRecognizer (via AVAudioEngine) can share the session.
**Warning signs:** Recording works but transcription is empty, or vice versa.

### Pitfall 4: Widget Extension Bundle ID and App Group Mismatch
**What goes wrong:** Widget can't read/write the shared SwiftData store because its App Group entitlement doesn't match the main app's.
**Why it happens:** XcodeGen project.yml must have the widget extension target with the exact same App Group ID as the main app and share extension.
**How to avoid:** Use the existing `group.quartermint.mission-control` App Group ID. Add it to the widget extension's entitlements in project.yml. Verify with `SharedModelContainer` import in the widget target.
**Warning signs:** Widget shows stale or empty data; crashes with "Failed to create ModelContainer."

### Pitfall 5: AVAudioRecorder and AVAudioEngine Competing for Input
**What goes wrong:** AVAudioRecorder records silence or AVAudioEngine tap receives no data when both are active simultaneously.
**Why it happens:** Both want exclusive access to the audio input node. On some devices they cannot share the hardware input.
**How to avoid:** Use a single AVAudioEngine for both recording AND waveform data. Install a tap on the input node for waveform visualization, and use AVAudioRecorder separately pointed at the same audio hardware. Alternatively, use ONLY AVAudioEngine with an output file node -- but this is more complex. Test on real device. If they conflict, use AVAudioRecorder.isMeteringEnabled + averagePower(forChannel:) for simpler waveform data instead of AVAudioEngine tap.
**Warning signs:** Waveform shows flat line while recording works, or recording is silent while waveform animates.

### Pitfall 6: Microphone Permission Not Requested Before Recording
**What goes wrong:** Recording fails silently or crashes because microphone permission wasn't granted.
**Why it happens:** SFSpeechRecognizer requires its own permission (NSSpeechRecognitionUsageDescription) separate from microphone permission (NSMicrophoneUsageDescription). Both must be in Info.plist and both must be authorized.
**How to avoid:** Request both permissions at voice recording entry point: `AVAudioApplication.requestRecordPermission` and `SFSpeechRecognizer.requestAuthorization`. Show a clear explanation before the system prompt. Handle denial gracefully with a settings redirect.
**Warning signs:** Permission dialog never appears; recording callback returns empty data.

### Pitfall 7: SwiftData Schema Migration When Adding Fields
**What goes wrong:** App crashes on launch because QueuedCapture model has new fields (audioFilePath, transcriptionText) but existing SwiftData store doesn't.
**Why it happens:** SwiftData handles lightweight migrations automatically only for additive changes with defaults. New optional fields are fine. New required fields without defaults crash.
**How to avoid:** Make all new QueuedCapture fields optional (String?). SwiftData's automatic lightweight migration handles optional field additions without explicit migration plans.
**Warning signs:** Fatal error in ModelContainer initialization after app update.

## Code Examples

### Widget Entry View with AppIntent Button
```swift
// Source: Apple WidgetKit documentation + verified patterns
import WidgetKit
import SwiftUI
import AppIntents

struct CaptureIntent: AppIntent {
    static var title: LocalizedStringResource = "Quick Capture"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        let defaults = UserDefaults(suiteName: "group.quartermint.mission-control")
        defaults?.set(true, forKey: "showQuickCapture")
        return .result()
    }
}

struct CaptureWidgetEntryView: View {
    var entry: CaptureWidgetProvider.Entry

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "brain.head.profile")
                Text("Mission Control")
                    .font(.headline)
            }

            Button(intent: CaptureIntent()) {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("Quick Capture")
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(Color.accentColor.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)

            if entry.pendingCount > 0 {
                Text("\(entry.pendingCount) pending")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}
```

### AVAudioRecorder Setup for .m4a
```swift
// Source: Apple AVFoundation documentation
import AVFoundation

class AudioRecorderService {
    private var audioRecorder: AVAudioRecorder?
    private(set) var audioURL: URL?
    private(set) var isRecording = false

    func startRecording() throws -> URL {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try session.setActive(true)

        let containerURL = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppConstants.appGroupID)!
            .appendingPathComponent("AudioCaptures", isDirectory: true)

        try FileManager.default.createDirectory(at: containerURL, withIntermediateDirectories: true)

        let fileURL = containerURL.appendingPathComponent("\(UUID().uuidString).m4a")

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        audioRecorder = try AVAudioRecorder(url: fileURL, settings: settings)
        audioRecorder?.isMeteringEnabled = true  // For waveform
        audioRecorder?.record()
        audioURL = fileURL
        isRecording = true
        return fileURL
    }

    func stopRecording() {
        audioRecorder?.stop()
        isRecording = false
    }

    /// Call periodically for waveform visualization
    func currentLevel() -> Float {
        audioRecorder?.updateMeters()
        return audioRecorder?.averagePower(forChannel: 0) ?? -160
    }
}
```

### SFSpeechRecognizer Chunked Transcription
```swift
// Source: Apple Speech framework documentation + chunking pattern
import Speech
import AVFoundation

@MainActor
@Observable
class TranscriptionService {
    private let speechRecognizer = SFSpeechRecognizer()!
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var chunkTimer: Timer?

    private(set) var chunks: [String] = []
    private(set) var currentPartialText: String = ""
    private(set) var isTranscribing = false

    var fullTranscription: String {
        let committed = chunks.joined(separator: " ")
        if currentPartialText.isEmpty { return committed }
        if committed.isEmpty { return currentPartialText }
        return committed + " " + currentPartialText
    }

    func startTranscribing() throws {
        guard speechRecognizer.isAvailable,
              speechRecognizer.supportsOnDeviceRecognition else {
            throw TranscriptionError.notAvailable
        }
        isTranscribing = true
        startNewChunk()
    }

    private func startNewChunk() {
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let request = recognitionRequest else { return }
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = true

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }

        audioEngine.prepare()
        try? audioEngine.start()

        recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            if let result {
                self.currentPartialText = result.bestTranscription.formattedString
                if result.isFinal {
                    self.chunks.append(result.bestTranscription.formattedString)
                    self.currentPartialText = ""
                }
            }
        }

        // Restart before 1-minute limit
        chunkTimer = Timer.scheduledTimer(withTimeInterval: 55, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.restartChunk()
            }
        }
    }

    private func restartChunk() {
        chunkTimer?.invalidate()
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
        recognitionRequest?.endAudio()
        // isFinal callback will fire, appending chunk
        startNewChunk()
    }

    func stopTranscribing() {
        chunkTimer?.invalidate()
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
        recognitionRequest?.endAudio()
        isTranscribing = false
    }
}

enum TranscriptionError: Error {
    case notAvailable
    case permissionDenied
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static widgets | Interactive widgets (Button/Toggle via AppIntents) | iOS 17 (2023) | Widget can trigger actions without opening app |
| SFSpeechRecognizer only | SpeechAnalyzer (iOS 26) | WWDC 2025 | Better long-form transcription, but requires iOS 26 minimum. Deferred per KNOW-F02. |
| Widget URL-only deep links | AppIntent with openAppWhenRun | iOS 17 (2023) | More structured app launch from widget with typed parameters |
| Core Data for shared storage | SwiftData with App Group | iOS 17 (2023) | Simpler API, automatic lightweight migration, already adopted in Phase 29 |

**Deprecated/outdated:**
- IntentDefinition files (.intentdefinition) for widget configuration: replaced by AppIntents framework (iOS 17+)
- SFSpeechRecognizer server-based recognition for single-user apps: on-device recognition is now fast enough and more private

## API Contract Considerations

### Current State
The MC API `POST /api/captures` accepts JSON with `rawContent`, `type`, `projectId`, `clientId`. The `type` field already supports `"voice"` in the Zod schema (`captureTypeEnum`). However, there is no field for audio file storage (no `audioUrl` or file upload endpoint).

### Voice Capture Sync Strategy
Two options for syncing voice captures with audio files:

**Option A: Transcription-only sync (recommended for v1.4)**
- Voice capture syncs as type: "voice" with rawContent set to the transcription text
- Audio .m4a file stays on-device only (not uploaded to server)
- Simplest: no API changes, no file upload, no server storage
- Tradeoff: audio file not available on server/web dashboard

**Option B: Audio file upload**
- Requires new multipart upload endpoint or base64 encoding in JSON body
- Requires server-side file storage (data/audio/ directory)
- Requires new `audioUrl` field on captures schema
- More complex but preserves audio on server

**Recommendation:** Option A for v1.4. The transcription IS the capture content. Audio file preserved on-device as backup. File upload can be added in a future phase if needed. This avoids API schema changes and keeps the phase focused on iOS.

### QueuedCapture Model Extension
```swift
// Extended fields (all optional for SwiftData auto-migration)
var audioFilePath: String?      // Relative path within App Group container
var transcriptionText: String?  // Full stitched transcription
var audioDuration: Double?      // Recording duration in seconds
```

When syncing a voice capture, the SyncEngine sets `rawContent = transcriptionText` and `type = "voice"`.

## Open Questions

1. **AVAudioRecorder + AVAudioEngine coexistence on real device**
   - What we know: Both use the audio session. AVAudioRecorder records to file, AVAudioEngine provides real-time buffer tap for waveform. They should coexist but device behavior varies.
   - What's unclear: Whether installTap on AVAudioEngine input interferes with AVAudioRecorder's input on all device models.
   - Recommendation: Implement with AVAudioRecorder.isMeteringEnabled + averagePower(forChannel:) as the primary waveform source (simpler, guaranteed to work). Fall back approach: use AVAudioEngine exclusively with a file output node if metering proves insufficient for visual quality. Test on real hardware.

2. **Audio file cleanup policy**
   - What we know: Audio files stored in App Group container persist until explicitly deleted.
   - What's unclear: When to clean up audio files for synced captures. After successful sync? After N days?
   - Recommendation: Delete audio file 7 days after successful sync. Immediate deletion after sync is also acceptable since server has the transcription. Planner should include a cleanup task.

3. **Widget pending count display**
   - What we know: Widget timeline can show pending capture count from SwiftData.
   - What's unclear: How frequently WidgetKit refreshes the timeline to show updated count.
   - Recommendation: Use `WidgetCenter.shared.reloadTimelines(ofKind:)` when SyncEngine completes a sync cycle. Widget shows count from last timeline update.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode | Build + test | Yes | 26.0.1 | -- |
| XcodeGen | Project generation | Yes | 2.44.1 | -- |
| Swift | Compilation | Yes | 6.2 | -- |
| iOS SDK | Target platform | Yes | 26.0 | -- |
| iPhone Simulator | Testing | Yes | iPhone 16 Pro + others | -- |
| SFSpeechRecognizer on-device | Transcription | Yes (simulator) | iOS 17+ | -- |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | XCTest (Xcode 26) |
| Config file | project.yml (XcodeGen scheme includes test target) |
| Quick run command | `xcodebuild test -project MissionControl.xcodeproj -scheme MissionControl -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MissionControlTests 2>&1 \| tail -20` |
| Full suite command | `xcodebuild test -project MissionControl.xcodeproj -scheme MissionControl -destination 'platform=iOS Simulator,name=iPhone 16 Pro'` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IOS-03 | Widget intent sets showQuickCapture flag | unit | `xcodebuild test ... -only-testing:MissionControlTests/CaptureIntentTests` | Wave 0 |
| IOS-04 | QuickCaptureView writes to SwiftData offline queue | unit | `xcodebuild test ... -only-testing:MissionControlTests/QuickCaptureTests` | Wave 0 |
| IOS-05 | TranscriptionService chunks at 55s, stitches results | unit | `xcodebuild test ... -only-testing:MissionControlTests/TranscriptionServiceTests` | Wave 0 |
| IOS-06 | QueuedCapture stores audioFilePath + transcriptionText; SyncEngine sends type: "voice" | unit | `xcodebuild test ... -only-testing:MissionControlTests/VoiceCaptureTests` | Wave 0 |

### Sampling Rate
- **Per task commit:** Quick test run (specific test class)
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `MissionControlTests/CaptureIntentTests.swift` -- tests CaptureIntent sets UserDefaults flag
- [ ] `MissionControlTests/QuickCaptureTests.swift` -- tests QuickCaptureView save writes QueuedCapture
- [ ] `MissionControlTests/TranscriptionServiceTests.swift` -- tests chunking logic with mock SFSpeechRecognizer
- [ ] `MissionControlTests/VoiceCaptureTests.swift` -- tests QueuedCapture model with audio fields, SyncEngine voice type
- [ ] `MissionControlTests/AudioRecorderServiceTests.swift` -- tests recording service state management
- [ ] project.yml update: CaptureWidget extension target + test target source additions

## Sources

### Primary (HIGH confidence)
- Apple WidgetKit documentation -- interactive widgets only support Button + Toggle (no TextField)
- Apple AVFoundation documentation -- AVAudioRecorder settings for AAC/m4a
- Apple Speech framework documentation -- SFSpeechRecognizer on-device recognition, 1-minute limit
- Existing codebase: ~/mission-control-ios -- Phase 29 SwiftData models, SyncEngine, API client patterns

### Secondary (MEDIUM confidence)
- [createwithswift.com - Interactive Widgets](https://www.createwithswift.com/creating-interactive-widget-swiftui/) -- AppIntent button pattern in widgets
- [createwithswift.com - Live Audio Waveform](https://www.createwithswift.com/creating-a-live-audio-waveform-in-swiftui/) -- AVAudioEngine + SwiftUI waveform pattern
- [createwithswift.com - Live Audio Transcription](https://www.createwithswift.com/transcribing-audio-from-live-audio-using-the-speech-framework/) -- SFSpeechAudioBufferRecognitionRequest pattern
- [hackingwithswift.com - AVAudioRecorder](https://www.hackingwithswift.com/example-code/media/how-to-record-audio-using-avaudiorecorder) -- Recording settings
- [hackingwithswift.com - SwiftData from Widgets](https://www.hackingwithswift.com/quick-start/swiftdata/how-to-access-a-swiftdata-container-from-widgets) -- SwiftData + App Groups
- [andyibanez.com - SFSpeechRecognizer Local](https://www.andyibanez.com/posts/speech-recognition-sfspeechrecognizer/) -- On-device recognition, 1-minute limit
- [Swiftjective-C - Interactive Widget AppIntent](https://swiftjectivec.com/Snip-Create-A-Basic-Interactive-Widget-Using-App-Intent-Button/) -- AppIntent + Button pattern

### Tertiary (LOW confidence)
- [Medium - SwiftUI Navigation with AppIntents](https://medium.com/@leonsular/swiftui-navigation-with-appintents-62bdda2af579) -- openAppWhenRun navigation pattern (403, could not verify)
- [Medium - SFSpeechRecognizer chunking](https://medium.com/@kamil.tustanowski/speech-recognition-using-the-speech-framework-72d31f4f344a) -- Chunked recognition restart (403, could not verify)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All Apple frameworks, well-documented, already validated in Phase 29
- Architecture: MEDIUM - Widget deep-link pattern is well-established but the exact AppIntent-to-navigation flow has multiple valid approaches. AVAudioRecorder + SFSpeechRecognizer coexistence needs real-device validation.
- Pitfalls: HIGH - WidgetKit text input limitation is well-documented. SFSpeechRecognizer 1-minute limit is well-known. Audio session conflicts are a classic iOS pitfall.

**Critical finding for planner:** CONTEXT.md D-01 says "text input area" in the widget. This is impossible in WidgetKit. The widget MUST use a Button that opens the app to a text input view. The 3-tap flow still works: (1) tap widget button, (2) type in QuickCaptureView, (3) tap send. The planner must communicate this WidgetKit limitation clearly.

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable Apple frameworks, no expected changes)
