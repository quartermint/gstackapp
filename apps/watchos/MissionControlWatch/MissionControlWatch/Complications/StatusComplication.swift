//
//  StatusComplication.swift
//  MissionControlWatch
//
//  Complication controller for managing cached status updates.
//  The actual WidgetKit widgets are in the MissionControlWatchWidgets extension.
//

import Foundation
import WidgetKit

// MARK: - Cached Status Model

/// Cached status stored in shared UserDefaults (shared between app and widget extension)
struct CachedStatus: Codable, Sendable {
    let isConnected: Bool
    let isHealthy: Bool
    let nodeCount: Int
    let activeTaskCount: Int
    let timestamp: Date
}

// MARK: - Complication Controller

/// Helper class for managing complication updates from the main app.
/// Uses @MainActor for thread safety with Swift concurrency.
@MainActor
final class ComplicationController {
    static let shared = ComplicationController()

    private init() {}

    /// Update the cached status and reload complications
    func updateStatus(_ status: WatchSystemStatus) {
        guard let sharedDefaults = UserDefaults(suiteName: "group.com.mission-control.watch") else {
            return
        }

        let cached = CachedStatus(
            isConnected: true,
            isHealthy: status.isHealthy,
            nodeCount: status.nodeCount,
            activeTaskCount: status.activeTaskCount,
            timestamp: Date()
        )

        if let data = try? JSONEncoder().encode(cached) {
            sharedDefaults.set(data, forKey: "cachedStatus")
        }

        // Reload all timelines
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Mark as disconnected
    func markDisconnected() {
        guard let sharedDefaults = UserDefaults(suiteName: "group.com.mission-control.watch") else {
            return
        }

        let cached = CachedStatus(
            isConnected: false,
            isHealthy: false,
            nodeCount: 0,
            activeTaskCount: 0,
            timestamp: Date()
        )

        if let data = try? JSONEncoder().encode(cached) {
            sharedDefaults.set(data, forKey: "cachedStatus")
        }

        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Reload all complications
    func reloadComplications() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
