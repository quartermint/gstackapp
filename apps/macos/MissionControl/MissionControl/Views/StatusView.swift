//
//  StatusView.swift
//  MissionControl
//
//  Node health dashboard and system metrics display.
//

import SwiftUI

/// Status dashboard view
struct StatusView: View {
    @EnvironmentObject var appState: AppState
    @State private var isRefreshing = false
    @State private var selectedNode: NodeInfo?

    var body: some View {
        HSplitView {
            // Node list
            NodeListView(
                nodes: appState.nodes,
                selectedNode: $selectedNode,
                onRefresh: refreshNodes
            )
            .frame(minWidth: 250, maxWidth: 350)

            // Node details or overview
            if let node = selectedNode {
                NodeDetailView(node: node)
            } else {
                SystemOverviewView(
                    nodes: appState.nodes,
                    computeManager: appState.computeManager
                )
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: refreshNodes) {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(isRefreshing)
                .help("Refresh node status")
            }
        }
        .onAppear {
            refreshNodes()
        }
    }

    private func refreshNodes() {
        isRefreshing = true
        Task {
            do {
                let nodes = try await appState.apiClient.listNodes()
                await MainActor.run {
                    appState.nodes = nodes
                    isRefreshing = false
                }
            } catch {
                await MainActor.run {
                    isRefreshing = false
                }
            }
        }
    }
}

/// Node list sidebar
struct NodeListView: View {
    let nodes: [NodeInfo]
    @Binding var selectedNode: NodeInfo?
    let onRefresh: () -> Void

    private var onlineNodes: [NodeInfo] {
        nodes.filter { $0.status == .online || $0.status == .busy }
    }

    private var offlineNodes: [NodeInfo] {
        nodes.filter { $0.status == .offline }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Nodes")
                    .font(.headline)
                Spacer()
                Text("\(onlineNodes.count)/\(nodes.count) online")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal)
            .padding(.vertical, 12)

            Divider()

            // Node list
            List(selection: $selectedNode) {
                if !onlineNodes.isEmpty {
                    Section("Online") {
                        ForEach(onlineNodes) { node in
                            NodeRow(node: node)
                                .tag(node)
                        }
                    }
                }

                if !offlineNodes.isEmpty {
                    Section("Offline") {
                        ForEach(offlineNodes) { node in
                            NodeRow(node: node)
                                .tag(node)
                        }
                    }
                }

                if nodes.isEmpty {
                    Text("No nodes registered")
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding()
                }
            }
            .listStyle(.sidebar)
        }
        .background(Color(NSColor.controlBackgroundColor))
    }
}

/// Single node row
struct NodeRow: View {
    let node: NodeInfo

    var body: some View {
        HStack(spacing: 12) {
            // Status indicator
            Circle()
                .fill(statusColor)
                .frame(width: 10, height: 10)

            VStack(alignment: .leading, spacing: 2) {
                Text(node.hostname)
                    .font(.body)

                HStack(spacing: 4) {
                    Text(node.status.rawValue.capitalized)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    if let metrics = node.metrics, node.status != .offline {
                        Text("\(Int(metrics.cpuUsage))% CPU")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }

            Spacer()

            // Active tasks badge
            if let metrics = node.metrics, metrics.activeTasks > 0 {
                Text("\(metrics.activeTasks)")
                    .font(.caption)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.accentColor.opacity(0.2))
                    .cornerRadius(4)
            }
        }
        .padding(.vertical, 4)
    }

    private var statusColor: Color {
        switch node.status {
        case .online: return .green
        case .busy: return .yellow
        case .offline: return .gray
        }
    }
}

/// System overview when no node is selected
struct SystemOverviewView: View {
    let nodes: [NodeInfo]
    @ObservedObject var computeManager: ComputeManager

    private var totalActiveTasks: Int {
        nodes.compactMap(\.metrics?.activeTasks).reduce(0, +)
    }

    private var averageCPU: Double {
        let cpuValues = nodes.compactMap(\.metrics?.cpuUsage)
        guard !cpuValues.isEmpty else { return 0 }
        return cpuValues.reduce(0, +) / Double(cpuValues.count)
    }

    private var averageMemory: Double {
        let memValues = nodes.compactMap(\.metrics?.memoryUsage)
        guard !memValues.isEmpty else { return 0 }
        return memValues.reduce(0, +) / Double(memValues.count)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                Text("System Overview")
                    .font(.title2)
                    .fontWeight(.semibold)

                // Stats grid
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 16) {
                    StatCard(
                        title: "Online Nodes",
                        value: "\(nodes.filter { $0.status != .offline }.count)",
                        subtitle: "of \(nodes.count) total",
                        icon: "server.rack",
                        color: .green
                    )

                    StatCard(
                        title: "Active Tasks",
                        value: "\(totalActiveTasks)",
                        subtitle: "running now",
                        icon: "gear",
                        color: .blue
                    )

                    StatCard(
                        title: "Avg CPU Usage",
                        value: String(format: "%.0f%%", averageCPU),
                        subtitle: "across all nodes",
                        icon: "cpu",
                        color: .orange
                    )
                }

                // Compute contribution section
                if computeManager.isEnabled {
                    ComputeContributionCard(computeManager: computeManager)
                }

                // Connection status
                ConnectionStatusCard()

                Spacer()
            }
            .padding()
        }
    }
}

/// Stat card component
struct StatCard: View {
    let title: String
    let value: String
    let subtitle: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(color)
                Spacer()
            }

            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(value)
                        .font(.title)
                        .fontWeight(.bold)
                    Text(title)
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(NSColor.controlBackgroundColor))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
        )
    }
}

/// Compute contribution status card
struct ComputeContributionCard: View {
    @ObservedObject var computeManager: ComputeManager

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "cpu.fill")
                    .foregroundColor(.accentColor)
                Text("Compute Contribution")
                    .font(.headline)
                Spacer()
                Circle()
                    .fill(computeManager.isEnabled ? .green : .gray)
                    .frame(width: 8, height: 8)
                Text(computeManager.isEnabled ? "Active" : "Disabled")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Divider()

            HStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(computeManager.tasksCompleted)")
                        .font(.title2)
                        .fontWeight(.semibold)
                    Text("Tasks Completed")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("\(computeManager.activeTasks)")
                        .font(.title2)
                        .fontWeight(.semibold)
                    Text("Active Now")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(formatUptime(computeManager.uptime))
                        .font(.title2)
                        .fontWeight(.semibold)
                    Text("Uptime")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(NSColor.controlBackgroundColor))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.accentColor.opacity(0.3), lineWidth: 1)
        )
    }

    private func formatUptime(_ seconds: TimeInterval) -> String {
        let hours = Int(seconds) / 3600
        let minutes = (Int(seconds) % 3600) / 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        }
        return "\(minutes)m"
    }
}

/// Connection status card
struct ConnectionStatusCard: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        HStack {
            Circle()
                .fill(appState.connectionStatus.color)
                .frame(width: 12, height: 12)

            VStack(alignment: .leading, spacing: 2) {
                Text("Hub Connection")
                    .font(.caption)
                    .fontWeight(.medium)
                Text(appState.connectionStatus.description)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Button("Reconnect") {
                Task {
                    await appState.connect()
                }
            }
            .buttonStyle(.bordered)
            .disabled(appState.connectionStatus == .connecting)
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.secondary.opacity(0.1))
        )
    }
}

/// Node detail view
struct NodeDetailView: View {
    let node: NodeInfo

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(node.hostname)
                            .font(.title2)
                            .fontWeight(.semibold)

                        HStack(spacing: 8) {
                            Circle()
                                .fill(statusColor)
                                .frame(width: 8, height: 8)
                            Text(node.status.rawValue.capitalized)
                                .foregroundColor(.secondary)
                        }
                    }

                    Spacer()

                    Text("Last seen: \(node.lastHeartbeat, style: .relative)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Divider()

                // Metrics
                if let metrics = node.metrics {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("System Metrics")
                            .font(.headline)

                        // CPU gauge
                        MetricGauge(
                            title: "CPU Usage",
                            value: metrics.cpuUsage,
                            maxValue: 100,
                            unit: "%",
                            color: cpuColor(metrics.cpuUsage)
                        )

                        // Memory gauge
                        MetricGauge(
                            title: "Memory Usage",
                            value: metrics.memoryUsage,
                            maxValue: 100,
                            unit: "%",
                            color: memoryColor(metrics.memoryUsage)
                        )

                        // Active tasks
                        HStack {
                            Text("Active Tasks")
                            Spacer()
                            Text("\(metrics.activeTasks)")
                                .fontWeight(.semibold)
                        }
                    }
                }

                // Capabilities
                VStack(alignment: .leading, spacing: 8) {
                    Text("Capabilities")
                        .font(.headline)

                    FlowLayout(spacing: 8) {
                        ForEach(node.capabilities, id: \.self) { capability in
                            Text(capability)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.accentColor.opacity(0.1))
                                .cornerRadius(4)
                        }
                    }
                }

                Spacer()
            }
            .padding()
        }
    }

    private var statusColor: Color {
        switch node.status {
        case .online: return .green
        case .busy: return .yellow
        case .offline: return .gray
        }
    }

    private func cpuColor(_ value: Double) -> Color {
        if value > 80 { return .red }
        if value > 60 { return .yellow }
        return .green
    }

    private func memoryColor(_ value: Double) -> Color {
        if value > 90 { return .red }
        if value > 70 { return .yellow }
        return .green
    }
}

/// Metric gauge component
struct MetricGauge: View {
    let title: String
    let value: Double
    let maxValue: Double
    let unit: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                Spacer()
                Text(String(format: "%.1f%@", value, unit))
                    .fontWeight(.semibold)
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.secondary.opacity(0.2))

                    RoundedRectangle(cornerRadius: 4)
                        .fill(color)
                        .frame(width: geometry.size.width * (value / maxValue))
                }
            }
            .frame(height: 8)
        }
    }
}

/// Flow layout for tags
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.width ?? 0, subviews: subviews, spacing: spacing)
        return CGSize(width: proposal.width ?? 0, height: result.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)
        for (index, line) in result.lines.enumerated() {
            var x = bounds.minX
            let y = bounds.minY + result.lineYs[index]
            for item in line {
                let size = subviews[item].sizeThatFits(.unspecified)
                subviews[item].place(at: CGPoint(x: x, y: y), proposal: .unspecified)
                x += size.width + spacing
            }
        }
    }

    struct FlowResult {
        var lines: [[Int]] = [[]]
        var lineYs: [CGFloat] = [0]
        var height: CGFloat = 0

        init(in width: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var currentX: CGFloat = 0
            var currentLineHeight: CGFloat = 0

            for (index, subview) in subviews.enumerated() {
                let size = subview.sizeThatFits(.unspecified)
                if currentX + size.width > width && !lines[lines.count - 1].isEmpty {
                    lines.append([])
                    lineYs.append(lineYs.last! + currentLineHeight + spacing)
                    currentX = 0
                    currentLineHeight = 0
                }
                lines[lines.count - 1].append(index)
                currentX += size.width + spacing
                currentLineHeight = max(currentLineHeight, size.height)
            }
            height = lineYs.last! + currentLineHeight
        }
    }
}

// MARK: - Hashable Conformance

extension NodeInfo: Hashable {
    static func == (lhs: NodeInfo, rhs: NodeInfo) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Preview

#Preview {
    StatusView()
        .environmentObject(AppState())
}
