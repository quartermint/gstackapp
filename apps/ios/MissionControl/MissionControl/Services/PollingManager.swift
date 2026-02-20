import Foundation
import Observation

/// Centralized polling manager with adaptive foreground/background rates
@MainActor
@Observable
final class PollingManager {
    static let shared = PollingManager()

    private(set) var isActive = false
    private(set) var isForeground = true

    /// Current polling interval in seconds
    var currentInterval: TimeInterval {
        isForeground ? foregroundInterval : backgroundInterval
    }

    private let foregroundInterval: TimeInterval = 5
    private let backgroundInterval: TimeInterval = 60

    private var pollingTask: Task<Void, Never>?
    private var callbacks: [String: () async -> Void] = [:]

    private init() {}

    // MARK: - Registration

    /// Register a refresh callback with a unique key
    func register(key: String, callback: @escaping () async -> Void) {
        callbacks[key] = callback
    }

    /// Unregister a callback
    func unregister(key: String) {
        callbacks.removeValue(forKey: key)
    }

    // MARK: - Lifecycle

    /// Start polling
    func start() {
        guard !isActive else { return }
        isActive = true
        schedulePolling()
    }

    /// Stop polling
    func stop() {
        isActive = false
        pollingTask?.cancel()
        pollingTask = nil
    }

    /// Switch to foreground polling rate (5s)
    func setForeground() {
        isForeground = true
        if isActive {
            restartPolling()
        }
    }

    /// Switch to background polling rate (60s)
    func setBackground() {
        isForeground = false
        if isActive {
            restartPolling()
        }
    }

    // MARK: - Private

    private func restartPolling() {
        pollingTask?.cancel()
        schedulePolling()
    }

    private func schedulePolling() {
        pollingTask = Task {
            while !Task.isCancelled && isActive {
                // Execute all registered callbacks
                for (_, callback) in callbacks {
                    await callback()
                }

                let interval = currentInterval
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            }
        }
    }
}
