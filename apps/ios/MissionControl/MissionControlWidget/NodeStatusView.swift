import SwiftUI
import WidgetKit

/// Widget views for different widget families
struct NodeStatusWidgetView: View {
    let entry: NodeStatusEntry

    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            smallView
        case .systemMedium:
            mediumView
        case .accessoryCircular:
            circularView
        default:
            smallView
        }
    }

    // MARK: - Small Widget

    private var smallView: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Circle()
                    .fill(entry.isConnected ? Color.green : Color.red)
                    .frame(width: 10, height: 10)

                Text("Mission Control")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Image(systemName: "server.rack")
                        .font(.caption)
                    Text("\(entry.onlineNodes)/\(entry.totalNodes) Online")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }

                HStack(spacing: 4) {
                    Image(systemName: "list.bullet")
                        .font(.caption)
                    Text("\(entry.activeTasks) Active Tasks")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
            }

            Text(entry.date, style: .relative)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(4)
    }

    // MARK: - Medium Widget

    private var mediumView: some View {
        HStack(spacing: 16) {
            // Left side: summary
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Circle()
                        .fill(entry.isConnected ? Color.green : Color.red)
                        .frame(width: 10, height: 10)

                    Text("Mission Control")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 4) {
                        Image(systemName: "server.rack")
                            .font(.caption)
                            .foregroundStyle(.green)
                        Text("\(entry.onlineNodes)/\(entry.totalNodes) Online")
                            .font(.subheadline)
                            .fontWeight(.medium)
                    }

                    HStack(spacing: 4) {
                        Image(systemName: "list.bullet")
                            .font(.caption)
                            .foregroundStyle(.blue)
                        Text("\(entry.activeTasks) Active")
                            .font(.subheadline)
                            .fontWeight(.medium)
                    }
                }

                Spacer()

                Text(entry.date, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Divider()

            // Right side: health status
            VStack(alignment: .leading, spacing: 8) {
                Text("Health")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)

                Spacer()

                VStack(spacing: 4) {
                    Image(systemName: healthIcon)
                        .font(.title)
                        .foregroundStyle(healthColor)

                    Text(healthText)
                        .font(.caption)
                        .fontWeight(.medium)
                }

                Spacer()
            }
            .frame(maxWidth: .infinity)
        }
        .padding(4)
    }

    // MARK: - Circular (Lock Screen)

    private var circularView: some View {
        Gauge(value: Double(entry.onlineNodes), in: 0...max(Double(entry.totalNodes), 1)) {
            Image(systemName: "server.rack")
        } currentValueLabel: {
            Text("\(entry.onlineNodes)")
                .font(.system(.body, design: .rounded))
                .fontWeight(.bold)
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .tint(entry.isConnected ? .green : .red)
    }

    // MARK: - Helpers

    private var healthIcon: String {
        switch entry.health {
        case .healthy: return "checkmark.shield.fill"
        case .degraded: return "exclamationmark.shield.fill"
        case .offline: return "xmark.shield.fill"
        case .unknown: return "questionmark.circle"
        }
    }

    private var healthColor: Color {
        switch entry.health {
        case .healthy: return .green
        case .degraded: return .orange
        case .offline: return .red
        case .unknown: return .gray
        }
    }

    private var healthText: String {
        switch entry.health {
        case .healthy: return "Healthy"
        case .degraded: return "Degraded"
        case .offline: return "Offline"
        case .unknown: return "Unknown"
        }
    }
}

// MARK: - Previews

#Preview("Small", as: .systemSmall) {
    NodeStatusWidget()
} timeline: {
    NodeStatusEntry.placeholder
    NodeStatusEntry.offline
}

#Preview("Medium", as: .systemMedium) {
    NodeStatusWidget()
} timeline: {
    NodeStatusEntry.placeholder
}

#Preview("Circular", as: .accessoryCircular) {
    NodeStatusWidget()
} timeline: {
    NodeStatusEntry.placeholder
}
