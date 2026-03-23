# Phase 36: iOS Edge Intelligence - Research

**Researched:** 2026-03-23
**Domain:** Apple Foundation Models framework (iOS 26), on-device ML, Swift/SwiftUI, API contract extension
**Confidence:** HIGH

## Summary

Phase 36 adds Apple Foundation Models integration to the existing Mission Control iOS companion app (built in v1.4 phases 29-30). The framework provides a free, on-device ~3B parameter language model with constrained decoding via the `@Generable` macro, guaranteeing structured output at the token level. The development environment is confirmed ready: Xcode 26.0.1 with iOS 26.0 SDK installed.

The core challenge is dual: (1) integrate Foundation Models as an enhancement layer that degrades gracefully on iOS 17-25 devices and devices without Apple Intelligence, and (2) extend the server-side `POST /api/captures` contract to accept a `deviceClassification` hint from the iOS client so the enrichment pipeline can skip or confirm classification for high-confidence device-classified captures.

**Primary recommendation:** Use `#if canImport(FoundationModels)` for compile-time gating and `if #available(iOS 26, *)` plus `SystemLanguageModel.default.availability` for runtime gating. Build a `CaptureClassifier` service behind a protocol so it can be mocked in tests and cleanly disabled on unsupported devices. Keep the @Generable struct minimal (projectSlug, confidence, extractionType, reasoning) to fit well within the 4096 token budget.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** iOS 17+ minimum deployment target (from v1.4 decision). Foundation Models is an enhancement layer -- captures work without it, they just skip on-device enrichment.
- **D-02:** @Generable-style constrained decoding for capture classification: project slug, confidence score, extraction type. Guaranteed structural correctness at token level.
- **D-03:** ~4096 token context window. For long captures, use summarization strategy (like FoundationChat's approach).
- **D-04:** High-confidence captures (>0.8) enriched entirely on-device. Never hit Mac Mini for classification.
- **D-05:** Complex captures (ambiguous, multi-project, low confidence) sync to Mac Mini with on-device pre-classification as hint.
- **D-06:** All capture processing works offline. Foundation Models + local SwiftData queue = full offline functionality.
- **D-07:** Capture metadata includes: city-level location (Core Location), time-of-day, source app (from share sheet UTI), connectivity state.

### Claude's Discretion
- Foundation Models session management and prewarm strategy
- @Generable struct design for capture classification
- Confidence threshold tuning (0.8 initial, adjustable)
- How device context metadata displays on capture cards (dashboard side)
- Error handling for devices without Apple Intelligence

### Deferred Ideas (OUT OF SCOPE)
- Foundation Models tool calling for device-local actions (calendar, contacts)
- On-device voice transcription + classification in one pass
- Foundation Models for notification summarization (if MC ever adds push)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDGE-01 | On-device structured capture via Foundation Models constrained decoding | @Generable macro with CaptureClassification struct; LanguageModelSession.respond(to:generating:) for constrained output; verified 4096 token budget |
| EDGE-02 | Pre-sync enrichment -- classify + extract on device before syncing | Insert classification step in SyncEngine before API call; extend QueuedCapture SwiftData model with deviceClassification fields |
| EDGE-03 | Smart routing -- simple captures stay on-device, complex route to Mac Mini | Confidence threshold (0.8) determines routing; extend CreateCaptureRequest with optional deviceClassification payload; server enrichment pipeline uses hint |
| EDGE-04 | Offline intelligence -- all capture processing works without network | Foundation Models runs entirely on-device; SwiftData queue persists classifications; no network dependency for classification |
| EDGE-05 | Context enrichment from device sensors | LocationService already captures city; extend with time-of-day classification, connectivity state from ConnectionMonitor, sourceApp from share sheet UTI |
| EDGE-06 | Context window management -- summarization strategy for long captures | Token estimation heuristic (word_count / 0.75); 70% threshold (3500 tokens) triggers summarization; separate LanguageModelSession for summarization |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FoundationModels | iOS 26.0 SDK | On-device LLM with constrained decoding | Apple first-party; free; on-device; @Generable macro for guaranteed structured output |
| SwiftData | iOS 17.0+ | Offline queue persistence | Already in use for QueuedCapture; extends naturally with new fields |
| CoreLocation | iOS 17.0+ | City-level location metadata | Already in use via LocationService; reduced accuracy for privacy |
| Network (NWPathMonitor) | iOS 17.0+ | Connectivity state metadata | Already in use via ConnectionMonitor |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod (server-side) | 3.x | Validate deviceClassification in createCaptureSchema | Extend existing capture schema with optional device hint |
| Drizzle ORM (server-side) | 0.30+ | Store device classification metadata in captures table | Add columns for device-sourced classification |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Foundation Models | Core ML with custom model | Foundation Models is zero-config, constrained decoding built-in; Core ML requires training/converting a model |
| @Generable constrained decoding | JSON mode + manual parsing | @Generable guarantees structural correctness at token level; JSON mode can produce malformed output |
| Token heuristic (word/0.75) | Apple tokenizer API | Apple does not expose a public tokenizer; heuristic is the community standard approach |

**Installation:** No new package dependencies. Foundation Models ships with iOS 26 SDK. The iOS app has zero external dependencies (Apple frameworks only, per v1.4 decision).

## Architecture Patterns

### Recommended Project Structure (additions to existing iOS app)
```
MissionControl/
  Services/
    CaptureClassifier.swift          # Foundation Models integration
    CaptureClassifierProtocol.swift  # Protocol for testability
  Models/
    CaptureClassification.swift      # @Generable struct + related types
Shared/
  QueuedCapture.swift                # Extended with classification fields
  DeviceContext.swift                 # Structured device metadata
MissionControlTests/
  CaptureClassifierTests.swift       # Unit tests with mock
  Mocks/MockCaptureClassifier.swift  # Mock classifier for sync tests
```

### Pattern 1: Conditional Framework Import + Runtime Availability
**What:** Dual-gating to support iOS 17 deployment target while using iOS 26 APIs.
**When to use:** Any code that touches FoundationModels framework.
**Example:**
```swift
// Source: Apple Developer Documentation + community patterns
#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26, *)
final class FoundationModelsCaptureClassifier: CaptureClassifierProtocol {
    private let model = SystemLanguageModel.default
    private var session: LanguageModelSession?

    var isAvailable: Bool {
        switch model.availability {
        case .available: return true
        default: return false
        }
    }

    func classify(content: String, projects: [(slug: String, name: String)]) async throws -> CaptureClassification {
        let session = LanguageModelSession {
            """
            You are a capture classifier for Mission Control. Given capture text and a project list,
            classify the capture to the most relevant project with a confidence score.
            """
        }
        let prompt = buildPrompt(content: content, projects: projects)
        let response = try await session.respond(to: prompt, generating: CaptureClassification.self)
        return response.content
    }
}
#endif
```

### Pattern 2: @Generable Capture Classification Struct
**What:** Constrained decoding struct that the model is forced to produce.
**When to use:** All on-device classification responses.
**Example:**
```swift
// Source: WWDC25 Session 286 + azamsharp.com guide
#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26, *)
@Generable
struct CaptureClassification {
    @Guide(description: "The project slug this capture belongs to, or 'unassigned' if unclear")
    let projectSlug: String

    @Guide(description: "Confidence score from 0.0 to 1.0", .range(0...1))
    let confidence: Double

    @Guide(description: "The type of capture content")
    let extractionType: CaptureExtractionType

    @Guide(description: "Brief reasoning for the classification in one sentence")
    let reasoning: String
}

@available(iOS 26, *)
@Generable
enum CaptureExtractionType: String, Codable {
    case projectRef = "project_ref"
    case actionItem = "action_item"
    case idea
    case link
    case question
}
#endif
```

### Pattern 3: Protocol-Based Classifier for Testability
**What:** Protocol that abstracts classification so it can be mocked in tests and swapped based on availability.
**When to use:** All classification call sites (SyncEngine, ShareView, QuickCaptureView).
**Example:**
```swift
// Works on all iOS versions -- no FoundationModels dependency
protocol CaptureClassifierProtocol: Sendable {
    var isAvailable: Bool { get }
    func classify(content: String, projects: [(slug: String, name: String)]) async throws -> DeviceClassificationResult?
}

// Fallback for devices without Foundation Models
final class NoOpCaptureClassifier: CaptureClassifierProtocol {
    let isAvailable = false
    func classify(content: String, projects: [(slug: String, name: String)]) async throws -> DeviceClassificationResult? {
        return nil  // No classification -- server will handle it
    }
}
```

### Pattern 4: Context Window Management (FoundationChat-style)
**What:** Token estimation and summarization for long captures.
**When to use:** Before calling session.respond() when capture content might be long.
**Example:**
```swift
// Source: Dimillian/FoundationChat + Apple TN3193
private let maxTokens = 4096
private let safeTokenLimit = 3500

func estimateTokens(_ text: String) -> Int {
    // Rough estimation: 1 token ~= 0.75 words for English
    let wordCount = text.split(separator: " ").count
    return Int(Double(wordCount) / 0.75)
}

func classifyWithContextManagement(content: String, projects: [...]) async throws -> CaptureClassification {
    let systemPromptTokens = 200 // estimated
    let projectListTokens = estimateTokens(projectListString)
    let contentTokens = estimateTokens(content)
    let totalEstimate = systemPromptTokens + projectListTokens + contentTokens + 200 // response budget

    if totalEstimate > safeTokenLimit {
        // Summarize content first, then classify
        let summarizer = LanguageModelSession()
        let summary = try await summarizer.respond(to: "Summarize this text concisely: \(content)")
        return try await classifyFromText(summary.content, projects: projects)
    } else {
        return try await classifyFromText(content, projects: projects)
    }
}
```

### Pattern 5: Server-Side Device Hint Integration
**What:** Extend API contract to accept optional device classification and use it in enrichment pipeline.
**When to use:** Captures synced from iOS with pre-classification.
**Example:**
```typescript
// Server-side: extend createCaptureSchema
const deviceClassificationSchema = z.object({
  projectSlug: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  extractionType: z.enum(["project_ref", "action_item", "idea", "link", "question"]).nullable(),
  reasoning: z.string().nullable(),
  classifiedAt: z.string().datetime(),
  classifiedOnDevice: z.literal(true),
}).optional();

// In enrichment.ts: skip server-side classification if device hint is high-confidence
if (deviceHint && deviceHint.confidence > 0.8 && deviceHint.projectSlug) {
  // Trust device classification, skip AI call
  resolvedProjectId = capture.projectId ?? deviceHint.projectSlug;
  aiConfidence = deviceHint.confidence;
  aiReasoning = `Device-classified: ${deviceHint.reasoning}`;
}
```

### Anti-Patterns to Avoid
- **Importing FoundationModels unconditionally:** Will crash on iOS 17-25. Must use `#if canImport(FoundationModels)` and `@available(iOS 26, *)`.
- **Creating a new LanguageModelSession per classification:** Sessions carry context. For one-shot classification, creating a new session each time is fine, but prewarm at app launch if captures are frequent.
- **Blocking the UI on classification:** Classification should be async and fire-and-forget. Captures save to SwiftData immediately; classification is an enrichment step before sync.
- **Generating unnecessary fields in @Generable structs:** Every field consumes output tokens from the 4096 budget. Keep the classification struct minimal.
- **Trying to use Foundation Models in share extension:** Share extensions have strict memory limits (<120MB). Foundation Models loads a ~3B model. Classification must happen in the main app, not the extension.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output | Custom JSON parser + regex extraction | @Generable constrained decoding | Token-level structural guarantee; no parsing errors possible |
| On-device text classification | Core ML model + training pipeline | Foundation Models framework | Zero training needed; works with project list as context |
| Token counting | Custom BPE tokenizer | Word-count heuristic (word/0.75) | Apple doesn't expose tokenizer; heuristic is accurate enough for budget estimation |
| Availability detection | Version string parsing | `SystemLanguageModel.default.availability` switch | Covers all cases: device eligible, AI enabled, model ready |
| Model lifecycle management | Manual model loading/unloading | `session.prewarm()` + framework-managed lifecycle | Apple manages memory pressure; just prewarm when user likely to classify |

**Key insight:** Foundation Models handles the hard problems (model loading, memory management, structured decoding, safety guardrails). The app just needs to: define the output struct, write a good prompt, and handle the availability/fallback path.

## Common Pitfalls

### Pitfall 1: Foundation Models in Share Extension
**What goes wrong:** Share extensions have a 120MB memory limit. Foundation Models loads a ~3B parameter model that far exceeds this.
**Why it happens:** Developers try to classify at capture time in the share extension for immediate feedback.
**How to avoid:** Share extension writes to SwiftData only (existing pattern). Classification happens in the main app before sync. Share extension remains networking-free and classification-free.
**Warning signs:** Extension crashes or gets killed by the system on memory pressure.

### Pitfall 2: 4096 Token Budget Exhaustion
**What goes wrong:** System instructions + project list + capture content + response exceeds 4096 tokens. Throws `LanguageModelSession.GenerationError.exceededContextWindowSize`.
**Why it happens:** Project list is ~35 projects, each with slug + name + tagline. Long captures can consume 1000+ tokens.
**How to avoid:** Budget allocation: ~200 tokens system prompt, ~800 tokens project list (slugs + short names only, no taglines), ~2500 tokens capture content, ~500 tokens response. Use summarization for captures that exceed content budget. Catch `exceededContextWindowSize` error explicitly and fall back to server classification.
**Warning signs:** Classification failures on longer captures; error logs showing context window errors.

### Pitfall 3: Assuming Foundation Models is Always Available
**What goes wrong:** Code crashes or produces confusing UX on iOS 17-25 devices, or on iOS 26 devices without Apple Intelligence enabled.
**Why it happens:** Three separate availability gates: (1) iOS version, (2) device eligibility (A17 Pro+), (3) Apple Intelligence enabled in Settings.
**How to avoid:** Triple-gate: `#if canImport(FoundationModels)` (compile), `if #available(iOS 26, *)` (runtime version), `model.availability == .available` (runtime feature). Use NoOpCaptureClassifier as fallback.
**Warning signs:** Crashes on older devices; "model not available" errors with no fallback.

### Pitfall 4: Classifying Before Project List is Cached
**What goes wrong:** Classification runs with an empty project list, producing meaningless results.
**Why it happens:** First app launch before any successful API sync -- project list not yet cached in App Group UserDefaults.
**How to avoid:** CaptureClassifier reads project list from UserDefaults (same source as share extension project picker). If empty, skip classification and let server handle it.
**Warning signs:** All captures classified as "unassigned" on first use.

### Pitfall 5: Race Between Classification and Sync
**What goes wrong:** SyncEngine syncs a capture before classification completes, sending it without the device hint.
**Why it happens:** SyncEngine triggers on app foreground; classification might not be finished.
**How to avoid:** Classification writes result to SwiftData on QueuedCapture model. SyncEngine reads whatever classification state exists at sync time. If classification is still in progress, sync without hint (server classifies). Classification result syncs on next cycle.
**Warning signs:** Captures synced without device classification despite device being capable.

### Pitfall 6: Breaking the Existing API Contract
**What goes wrong:** Adding required fields to createCaptureSchema breaks existing iOS v1.4 clients that don't send deviceClassification.
**Why it happens:** Server schema validation rejects requests missing new required fields.
**How to avoid:** All new fields must be `z.optional()`. The deviceClassification object is entirely optional. Server enrichment checks for its presence and uses it as a hint only.
**Warning signs:** 400 errors from the API after server update but before iOS update.

## Code Examples

### Complete CaptureClassifier Service
```swift
// Source: Verified patterns from WWDC25 Session 286 + FoundationChat + Apple docs
#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26, *)
@MainActor
@Observable
final class CaptureClassifier: CaptureClassifierProtocol {
    private let model = SystemLanguageModel.default
    private let maxTokens = 4096
    private let safeTokenLimit = 3500

    var isAvailable: Bool {
        switch model.availability {
        case .available: return true
        default: return false
        }
    }

    func prewarm() {
        guard isAvailable else { return }
        let session = LanguageModelSession()
        session.prewarm()
    }

    func classify(
        content: String,
        projects: [(slug: String, name: String)]
    ) async throws -> DeviceClassificationResult? {
        guard isAvailable else { return nil }
        guard !projects.isEmpty else { return nil }

        let projectListStr = projects.map { "\($0.slug): \($0.name)" }.joined(separator: "\n")

        let session = LanguageModelSession {
            """
            You are a capture classifier for Mission Control. Given capture text and a project list,
            classify the capture to the most relevant project. If unsure, set projectSlug to "unassigned"
            and confidence to 0.0.

            Available projects:
            \(projectListStr)
            """
        }

        let captureContent: String
        let contentTokenEstimate = estimateTokens(content)
        let overheadEstimate = 200 + estimateTokens(projectListStr) + 500

        if contentTokenEstimate + overheadEstimate > safeTokenLimit {
            // Summarize long content
            let summarizer = LanguageModelSession()
            let summary = try await summarizer.respond(
                to: "Summarize this text concisely in 2-3 sentences: \(content)"
            )
            captureContent = summary.content
        } else {
            captureContent = content
        }

        let response = try await session.respond(
            to: "Classify this capture:\n\n\(captureContent)",
            generating: CaptureClassification.self
        )

        let classification = response.content
        return DeviceClassificationResult(
            projectSlug: classification.projectSlug == "unassigned" ? nil : classification.projectSlug,
            confidence: classification.confidence,
            extractionType: classification.extractionType.rawValue,
            reasoning: classification.reasoning,
            classifiedAt: Date(),
            classifiedOnDevice: true
        )
    }

    private func estimateTokens(_ text: String) -> Int {
        let wordCount = text.split(separator: " ").count
        return Int(Double(wordCount) / 0.75)
    }
}
#endif
```

### Extended QueuedCapture Model
```swift
// Shared/QueuedCapture.swift -- additions
@Model
final class QueuedCapture {
    // ... existing fields ...

    // EDGE-01: Device classification fields (optional for backward compat)
    var deviceProjectSlug: String?        // On-device classified project
    var deviceConfidence: Double?          // Classification confidence 0-1
    var deviceExtractionType: String?      // "project_ref", "action_item", etc.
    var deviceReasoning: String?           // Brief reasoning text
    var deviceClassifiedAt: Date?          // When classification happened

    // EDGE-05: Device context (extend existing city field)
    var timeOfDay: String?                 // "morning", "afternoon", "evening", "night"
    var connectivityState: String?         // "wifi", "cellular", "offline"
}
```

### Extended CreateCaptureRequest (iOS side)
```swift
struct CreateCaptureRequest: Encodable {
    let rawContent: String
    let type: String
    let projectId: String?
    let clientId: String?
    let deviceClassification: DeviceClassificationPayload?

    enum CodingKeys: String, CodingKey {
        case rawContent, type, projectId, clientId, deviceClassification
    }
}

struct DeviceClassificationPayload: Encodable {
    let projectSlug: String?
    let confidence: Double
    let extractionType: String?
    let reasoning: String?
    let classifiedAt: String   // ISO8601
    let classifiedOnDevice: Bool

    enum CodingKeys: String, CodingKey {
        case projectSlug, confidence, extractionType, reasoning, classifiedAt, classifiedOnDevice
    }
}
```

### Server-Side Schema Extension
```typescript
// packages/shared/src/schemas/capture.ts -- addition
export const deviceClassificationSchema = z.object({
  projectSlug: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  extractionType: extractionTypeEnum.nullable().optional(),
  reasoning: z.string().nullable().optional(),
  classifiedAt: z.string().datetime(),
  classifiedOnDevice: z.literal(true),
});

// Extend createCaptureSchema
export const createCaptureSchema = z.object({
  rawContent: z.string().min(1).max(10000),
  type: captureTypeEnum.optional().default("text"),
  projectId: z.string().optional(),
  userId: z.string().optional(),
  clientId: z.string().optional(),
  sourceType: captureSourceTypeEnum.optional(),
  deviceClassification: deviceClassificationSchema.optional(), // NEW
});
```

### Smart Routing in SyncEngine
```swift
// Modified sync loop in SyncEngine
for capture in pending {
    let content = capture.type == "voice" ? (capture.transcriptionText ?? capture.rawContent) : capture.rawContent

    // Build device classification payload if available
    var deviceClassification: DeviceClassificationPayload? = nil
    if let confidence = capture.deviceConfidence,
       let classifiedAt = capture.deviceClassifiedAt {
        deviceClassification = DeviceClassificationPayload(
            projectSlug: capture.deviceProjectSlug,
            confidence: confidence,
            extractionType: capture.deviceExtractionType,
            reasoning: capture.deviceReasoning,
            classifiedAt: ISO8601DateFormatter().string(from: classifiedAt),
            classifiedOnDevice: true
        )
    }

    // EDGE-03: Smart routing -- high-confidence captures send hint
    // Server uses hint to skip/confirm classification
    _ = try await apiClient.createCapture(
        rawContent: content,
        type: capture.type,
        projectId: capture.projectId ?? capture.deviceProjectSlug, // Device classification as fallback
        idempotencyKey: capture.idempotencyKey,
        deviceClassification: deviceClassification
    )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Core ML custom models | Foundation Models @Generable | iOS 26 (WWDC25, Jun 2025) | Zero training, constrained decoding built-in |
| JSON mode + manual parsing | @Generable + @Guide macros | iOS 26 | Token-level structural guarantees |
| Server-only enrichment | On-device pre-classification + server hint | This phase | Reduced Mac Mini load, offline intelligence |
| Unrestricted token generation | Constrained decoding (masking invalid tokens) | Foundation Models framework | Guaranteed valid output structure |

**Deprecated/outdated:**
- **NaturalLanguage framework for classification:** Still works for basic NLP but Foundation Models provides far more sophisticated understanding with context.
- **CreateML text classification:** Requires training data and custom models. Foundation Models is zero-config for this use case.

## Open Questions

1. **Share Extension Classification Timing**
   - What we know: Share extension cannot run Foundation Models (memory limit). Classification must happen in main app.
   - What's unclear: Should we classify when the app comes to foreground (before sync), or classify as a separate pass on all unclassified captures?
   - Recommendation: Classify during sync preparation. SyncEngine iterates pending captures, classifies unclassified ones, then syncs. This ensures classification happens right before the data leaves the device. Single pass, no extra lifecycle complexity.

2. **Project List Freshness for Classification**
   - What we know: Project list is cached in App Group UserDefaults by SyncEngine.cacheProjectList(). Updated on each successful project fetch.
   - What's unclear: How stale can the project list be before classification becomes unreliable?
   - Recommendation: Accept whatever is cached. Project lists change infrequently (days/weeks between new projects). Classification of captures to known projects works even with slightly stale lists. New projects not in the list will get "unassigned" and server corrects.

3. **Dashboard Display of Device Context Metadata**
   - What we know: Server needs to store and expose device context (city, time-of-day, connectivity, source app).
   - What's unclear: Exact UI treatment on capture cards.
   - Recommendation: Claude's discretion per CONTEXT.md. Suggest subtle metadata pills below capture content (similar to extraction badges pattern from Phase 33). Defer detailed dashboard design to implementation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode 26 | Foundation Models compilation | Yes | 26.0.1 | -- |
| iOS 26 SDK | FoundationModels framework | Yes | 26.0 | -- |
| iOS Simulator (26) | Development testing | Yes | 26.0 | Physical device |
| Swift 6.2 | Swift concurrency, @Generable | Yes | 6.2 | -- |
| Node.js | Server-side API changes | Yes | (existing) | -- |
| pnpm | Server build/test | Yes | (existing) | -- |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

**Note:** Foundation Models requires Apple Silicon (A17 Pro or later for iPhone, M1+ for Mac). Testing on Simulator on M-series Mac works. Physical device testing requires iPhone 15 Pro or later with iOS 26 and Apple Intelligence enabled.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (iOS) | XCTest (existing) |
| Framework (Server) | Vitest (existing) |
| iOS config | MissionControlTests target in project.yml |
| Server config | packages/api/vitest.config.ts |
| Quick run (iOS) | `xcodebuild test -project MissionControl.xcodeproj -scheme MissionControl -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MissionControlTests` |
| Quick run (Server) | `pnpm --filter @mission-control/api test` |
| Full suite | `pnpm test` (server) + `xcodebuild test` (iOS) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDGE-01 | @Generable struct produces valid classification | unit | `xcodebuild test ... -only-testing:MissionControlTests/CaptureClassifierTests` | Wave 0 |
| EDGE-02 | SyncEngine classifies before syncing | unit | `xcodebuild test ... -only-testing:MissionControlTests/SyncEngineTests` | Exists (extend) |
| EDGE-03 | High-confidence skips server enrichment; low-confidence includes hint | unit (server) | `pnpm --filter @mission-control/api test -- --run enrichment` | Exists (extend) |
| EDGE-04 | Classification works with no network | unit | `xcodebuild test ... -only-testing:MissionControlTests/CaptureClassifierTests` | Wave 0 |
| EDGE-05 | Device context metadata captured and synced | unit | `xcodebuild test ... -only-testing:MissionControlTests/DeviceContextTests` | Wave 0 |
| EDGE-06 | Long captures trigger summarization | unit | `xcodebuild test ... -only-testing:MissionControlTests/CaptureClassifierTests` | Wave 0 |

### Sampling Rate
- **Per task commit (iOS):** `xcodebuild test -project ~/mission-control-ios/MissionControl.xcodeproj -scheme MissionControl -destination 'platform=iOS Simulator,name=iPhone 16 Pro'`
- **Per task commit (Server):** `pnpm --filter @mission-control/api test`
- **Per wave merge:** Full suite for both repos
- **Phase gate:** All tests green in both repos before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `MissionControlTests/CaptureClassifierTests.swift` -- covers EDGE-01, EDGE-04, EDGE-06 (mock-based, cannot test real Foundation Models in CI)
- [ ] `MissionControlTests/DeviceContextTests.swift` -- covers EDGE-05
- [ ] `MissionControlTests/Mocks/MockCaptureClassifier.swift` -- mock for SyncEngine tests
- [ ] `packages/api/src/__tests__/routes/captures-device-hint.test.ts` -- covers EDGE-03 server-side
- [ ] `packages/api/src/__tests__/services/enrichment-device-hint.test.ts` -- covers EDGE-03 enrichment skip logic

**Note on Foundation Models testing:** The actual Foundation Models framework cannot be tested in CI (requires Apple Intelligence on device). All iOS tests use MockCaptureClassifier. Integration testing with real Foundation Models is manual on a physical device.

## Sources

### Primary (HIGH confidence)
- Apple Developer: WWDC25 Session 286 "Meet the Foundation Models framework" -- core API patterns
- Apple Developer: WWDC25 Session 301 "Deep dive into the Foundation Models framework" -- constrained decoding details
- Apple Developer: TN3193 "Managing the on-device foundation model's context window" -- token management
- Apple Developer Documentation: FoundationModels framework reference -- API surface
- Dimillian/FoundationChat (GitHub) -- production patterns for session management, summarization, SwiftData integration
- azamsharp.com "Ultimate Guide to Foundation Models Framework" -- @Generable/@Guide examples, tool protocol, availability checking

### Secondary (MEDIUM confidence)
- createwithswift.com "Exploring the Foundation Models framework" -- @Guide constraints, GenerationOptions
- zats.io "Making the most of Apple Foundation Models: Context Window" -- 70% threshold, summarization pattern, token heuristic
- artemnovichkov.com "Getting Started with Apple's Foundation Models" -- tool calling patterns, session reuse

### Tertiary (LOW confidence)
- datawizz.ai "10 Best Practices" -- general guidance (not code-verified)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Apple first-party framework, well-documented, Xcode 26 confirmed installed
- Architecture: HIGH -- Patterns directly from Apple WWDC sessions and FoundationChat reference app
- Pitfalls: HIGH -- Memory limits, token budget, availability gates are well-documented constraints
- Server integration: HIGH -- Existing codebase is well-understood; schema extension is additive

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (Foundation Models API is post-WWDC GA; stable for 30 days)
