//
//  StatusComplication.swift
//  MissionControlWatchWidgets
//
//  WidgetKit configuration for Mission Control status complications.
//  This is the widget extension entry point.
//

import SwiftUI
import WidgetKit

// MARK: - Timeline Entry

/// Timeline entry representing the system status at a point in time
struct StatusTimelineEntry: TimelineEntry {
    let date: Date
    let isConnected: Bool
    let isHealthy: Bool
    let nodeCount: Int
    let activeTaskCount: Int

    // MARK: - Sample Data

    static var sampleHealthy: StatusTimelineEntry {
        StatusTimelineEntry(
            date: Date(),
            isConnected: true,
            isHealthy: true,
            nodeCount: 3,
            activeTaskCount: 5
        )
    }

    static var sampleUnhealthy: StatusTimelineEntry {
        StatusTimelineEntry(
            date: Date(),
            isConnected: true,
            isHealthy: false,
            nodeCount: 2,
            activeTaskCount: 1
        )
    }

    static var sampleDisconnected: StatusTimelineEntry {
        StatusTimelineEntry(
            date: Date(),
            isConnected: false,
            isHealthy: false,
            nodeCount: 0,
            activeTaskCount: 0
        )
    }
}

// MARK: - Timeline Provider

/// Provides timeline entries for the status complication
struct StatusTimelineProvider: TimelineProvider {
    typealias Entry = StatusTimelineEntry

    func placeholder(in context: Context) -> StatusTimelineEntry {
        StatusTimelineEntry.sampleHealthy
    }

    func getSnapshot(in context: Context, completion: @escaping (StatusTimelineEntry) -> Void) {
        // For snapshot, return the cached status or a placeholder
        let entry = getCachedStatus() ?? StatusTimelineEntry.sampleHealthy
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StatusTimelineEntry>) -> Void) {
        // Get the current cached status
        let currentEntry = getCachedStatus() ?? StatusTimelineEntry(
            date: Date(),
            isConnected: false,
            isHealthy: false,
            nodeCount: 0,
            activeTaskCount: 0
        )

        // Request refresh in 15 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!

        let timeline = Timeline(
            entries: [currentEntry],
            policy: .after(nextUpdate)
        )

        completion(timeline)
    }

    // MARK: - Cache Access

    /// Get cached status from UserDefaults (shared with main app via App Groups)
    private func getCachedStatus() -> StatusTimelineEntry? {
        guard let sharedDefaults = UserDefaults(suiteName: "group.com.mission-control.watch") else {
            return nil
        }

        guard let data = sharedDefaults.data(forKey: "cachedStatus"),
              let status = try? JSONDecoder().decode(CachedStatus.self, from: data) else {
            return nil
        }

        return StatusTimelineEntry(
            date: Date(),
            isConnected: status.isConnected,
            isHealthy: status.isHealthy,
            nodeCount: status.nodeCount,
            activeTaskCount: status.activeTaskCount
        )
    }
}

// MARK: - Cached Status Model

/// Cached status stored in shared UserDefaults (shared between app and widget extension)
struct CachedStatus: Codable {
    let isConnected: Bool
    let isHealthy: Bool
    let nodeCount: Int
    let activeTaskCount: Int
    let timestamp: Date
}

// MARK: - Status Complication Widget

/// Main WidgetKit complication for Mission Control status
struct StatusComplication: Widget {
    let kind: String = "com.mission-control.status"

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: StatusTimelineProvider()
        ) { entry in
            ComplicationEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Mission Control")
        .description("Shows system status")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryCorner,
            .accessoryInline
        ])
    }
}

// MARK: - Widget Bundle Entry Point

@main
struct MissionControlWidgetBundle: WidgetBundle {
    var body: some Widget {
        StatusComplication()
    }
}
