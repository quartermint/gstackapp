//
//  ComplicationViews.swift
//  MissionControlWatch
//
//  Visual templates for watch face complications.
//

import SwiftUI
import WidgetKit
import MissionControlModels

// MARK: - Circular Complication View

/// Circular complication showing status icon
struct CircularComplicationView: View {
    let entry: StatusTimelineEntry

    var body: some View {
        ZStack {
            // Background ring
            Circle()
                .stroke(
                    entry.isHealthy ? Color.green.opacity(0.3) : Color.orange.opacity(0.3),
                    lineWidth: 3
                )

            // Status icon
            Image(systemName: statusIcon)
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(statusColor)
        }
        .widgetAccentable()
    }

    private var statusIcon: String {
        if !entry.isConnected {
            return "wifi.slash"
        }
        return entry.isHealthy ? "checkmark.circle" : "exclamationmark.triangle"
    }

    private var statusColor: Color {
        if !entry.isConnected {
            return .gray
        }
        return entry.isHealthy ? .green : .orange
    }
}

// MARK: - Rectangular Complication View

/// Rectangular complication showing status text and node count
struct RectangularComplicationView: View {
    let entry: StatusTimelineEntry

    var body: some View {
        HStack(spacing: 8) {
            // Status icon
            Image(systemName: statusIcon)
                .font(.system(size: 24, weight: .medium))
                .foregroundColor(statusColor)
                .widgetAccentable()

            VStack(alignment: .leading, spacing: 2) {
                // Status text
                Text(statusText)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(.primary)

                // Node count
                if entry.isConnected {
                    Text("\(entry.nodeCount) nodes")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()
        }
    }

    private var statusIcon: String {
        if !entry.isConnected {
            return "wifi.slash"
        }
        return entry.isHealthy ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
    }

    private var statusColor: Color {
        if !entry.isConnected {
            return .gray
        }
        return entry.isHealthy ? .green : .orange
    }

    private var statusText: String {
        if !entry.isConnected {
            return "Disconnected"
        }
        return entry.isHealthy ? "All Systems Go" : "Issues"
    }
}

// MARK: - Corner Complication View

/// Corner complication with minimal indicator
struct CornerComplicationView: View {
    let entry: StatusTimelineEntry

    var body: some View {
        Image(systemName: statusIcon)
            .font(.system(size: 20, weight: .semibold))
            .foregroundColor(statusColor)
            .widgetAccentable()
    }

    private var statusIcon: String {
        if !entry.isConnected {
            return "server.rack"
        }
        return entry.isHealthy ? "checkmark.circle.fill" : "exclamationmark.circle.fill"
    }

    private var statusColor: Color {
        if !entry.isConnected {
            return .gray
        }
        return entry.isHealthy ? .green : .orange
    }
}

// MARK: - Inline Complication View

/// Inline complication for text-based watch faces
struct InlineComplicationView: View {
    let entry: StatusTimelineEntry

    var body: some View {
        Label {
            Text(statusText)
        } icon: {
            Image(systemName: statusIcon)
        }
    }

    private var statusIcon: String {
        if !entry.isConnected {
            return "wifi.slash"
        }
        return entry.isHealthy ? "checkmark" : "exclamationmark.triangle"
    }

    private var statusText: String {
        if !entry.isConnected {
            return "Offline"
        }
        return entry.isHealthy ? "\(entry.nodeCount) OK" : "Issues"
    }
}

// MARK: - Main Entry View (switches based on family)

struct ComplicationEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: StatusTimelineEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            CircularComplicationView(entry: entry)
        case .accessoryRectangular:
            RectangularComplicationView(entry: entry)
        case .accessoryCorner:
            CornerComplicationView(entry: entry)
        case .accessoryInline:
            InlineComplicationView(entry: entry)
        @unknown default:
            CircularComplicationView(entry: entry)
        }
    }
}

// MARK: - Previews

#Preview("Circular - Healthy", as: .accessoryCircular) {
    StatusComplication()
} timeline: {
    StatusTimelineEntry.sampleHealthy
}

#Preview("Circular - Unhealthy", as: .accessoryCircular) {
    StatusComplication()
} timeline: {
    StatusTimelineEntry.sampleUnhealthy
}

#Preview("Rectangular - Healthy", as: .accessoryRectangular) {
    StatusComplication()
} timeline: {
    StatusTimelineEntry.sampleHealthy
}

#Preview("Rectangular - Disconnected", as: .accessoryRectangular) {
    StatusComplication()
} timeline: {
    StatusTimelineEntry.sampleDisconnected
}
