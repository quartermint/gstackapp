import SwiftUI
import MissionControlNetworking

/// View displaying system status and node information
struct StatusView: View {
    @State private var viewModel = StatusViewModel()
    @Environment(AppState.self) private var appState

    var body: some View {
        NavigationStack {
            List {
                connectionSection
                systemOverviewSection
                nodesSection
            }
            .navigationTitle("Status")
            .refreshable {
                await viewModel.refresh()
            }
            .task {
                await viewModel.refresh()
                viewModel.startAutoRefresh(interval: 30)
            }
            .onDisappear {
                viewModel.stopAutoRefresh()
            }
        }
    }

    // MARK: - Connection Section

    private var connectionSection: some View {
        Section {
            HStack {
                statusIndicator(isConnected: viewModel.isConnected)

                VStack(alignment: .leading, spacing: 2) {
                    Text(viewModel.isConnected ? "Connected" : "Disconnected")
                        .font(.headline)

                    if let lastUpdated = viewModel.lastUpdated {
                        Text("Updated \(lastUpdated, style: .relative) ago")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                if viewModel.isLoading {
                    ProgressView()
                }
            }
        } header: {
            Text("Hub Connection")
        }
    }

    // MARK: - System Overview Section

    private var systemOverviewSection: some View {
        Section {
            if let overview = viewModel.overview {
                // Rich overview from /admin/overview
                VStack(spacing: 12) {
                    HStack {
                        overviewCard(
                            title: "Nodes",
                            value: "\(overview.nodes.online)/\(overview.nodes.total)",
                            icon: "server.rack",
                            color: overview.nodes.online > 0 ? .green : .red
                        )

                        Divider()

                        overviewCard(
                            title: "Queue",
                            value: "\(overview.tasks.queueDepth)",
                            icon: "list.bullet",
                            color: overview.tasks.queueDepth > 10 ? .orange : .blue
                        )

                        Divider()

                        overviewCard(
                            title: "Utilization",
                            value: String(format: "%.0f%%", overview.nodes.utilizationPercent ?? 0),
                            icon: "gauge.medium",
                            color: (overview.nodes.utilizationPercent ?? 0) > 80 ? .orange : .green
                        )
                    }
                    .padding(.vertical, 4)

                    HStack(spacing: 16) {
                        Label(overview.system.uptimeFormatted, systemImage: "clock")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Label("v\(overview.system.version)", systemImage: "tag")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        if overview.errors.recentCount > 0 {
                            Label("\(overview.errors.recentCount) errors", systemImage: "exclamationmark.triangle")
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    }
                }
            } else {
                // Fallback basic overview
                HStack {
                    overviewCard(
                        title: "Nodes",
                        value: "\(viewModel.onlineNodeCount)/\(viewModel.nodes.count)",
                        icon: "server.rack",
                        color: viewModel.onlineNodeCount > 0 ? .green : .red
                    )

                    Divider()

                    overviewCard(
                        title: "Tasks",
                        value: "\(appState.activeTaskCount)",
                        icon: "list.bullet",
                        color: .blue
                    )

                    Divider()

                    overviewCard(
                        title: "Health",
                        value: viewModel.isHealthy ? "OK" : "Warn",
                        icon: viewModel.isHealthy ? "checkmark.shield" : "exclamationmark.shield",
                        color: viewModel.isHealthy ? .green : .orange
                    )
                }
                .padding(.vertical, 8)
            }
        } header: {
            Text("System Overview")
        }
    }

    private func overviewCard(title: String, value: String, icon: String, color: Color) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)

            Text(value)
                .font(.headline)

            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Nodes Section

    private var nodesSection: some View {
        Section {
            if viewModel.nodes.isEmpty {
                ContentUnavailableView(
                    "No Nodes",
                    systemImage: "server.rack",
                    description: Text("No compute nodes are registered")
                )
            } else {
                ForEach(viewModel.nodes) { node in
                    NavigationLink {
                        NodeDetailView(node: node, viewModel: viewModel)
                    } label: {
                        NodeRow(node: node, viewModel: viewModel)
                    }
                }
            }
        } header: {
            Text("Compute Nodes (\(viewModel.nodes.count))")
        }
    }

    // MARK: - Helper Views

    private func statusIndicator(isConnected: Bool) -> some View {
        Circle()
            .fill(isConnected ? Color.green : Color.red)
            .frame(width: 12, height: 12)
            .overlay {
                if isConnected {
                    Circle()
                        .stroke(Color.green.opacity(0.5), lineWidth: 2)
                        .scaleEffect(1.5)
                }
            }
    }
}

// MARK: - Node Row

struct NodeRow: View {
    let node: Node
    let viewModel: StatusViewModel

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(statusColor)
                .frame(width: 10, height: 10)

            VStack(alignment: .leading, spacing: 2) {
                Text(node.hostname)
                    .font(.headline)

                HStack(spacing: 8) {
                    Text(statusDisplayName)
                        .font(.caption)
                        .foregroundStyle(statusColor)

                    if let ip = node.tailscaleIp {
                        Text(ip)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            loadGauge(load: node.load)
        }
    }

    private var statusColor: Color {
        switch node.status {
        case .online:
            return .green
        case .offline:
            return .red
        case .busy:
            return .orange
        case .draining:
            return .yellow
        }
    }

    private var statusDisplayName: String {
        switch node.status {
        case .online: return "Online"
        case .offline: return "Offline"
        case .busy: return "Busy"
        case .draining: return "Draining"
        }
    }

    private func loadGauge(load: Double) -> some View {
        VStack(spacing: 2) {
            Gauge(value: load) {
                EmptyView()
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .scaleEffect(0.6)
            .frame(width: 30, height: 30)

            Text("\(Int(load * 100))%")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Node Detail View

struct NodeDetailView: View {
    let node: Node
    let viewModel: StatusViewModel

    @State private var showDrainConfirmation = false
    @State private var showForceOfflineConfirmation = false
    @State private var actionError: Error?

    var body: some View {
        List {
            Section("Status") {
                LabeledContent("Status", value: statusDisplayName)
                LabeledContent("Last Seen", value: viewModel.lastSeenText(for: node))

                HStack {
                    Text("Load")
                    Spacer()
                    Gauge(value: node.load) {
                        Text(viewModel.loadText(for: node))
                    }
                    .gaugeStyle(.accessoryLinearCapacity)
                    .frame(width: 100)
                }

                LabeledContent("Current Tasks", value: "\(node.currentTasks)")
                LabeledContent("Max Tasks", value: "\(node.maxConcurrentTasks)")
            }

            Section("Information") {
                LabeledContent("Hostname", value: node.hostname)

                if let ip = node.tailscaleIp {
                    LabeledContent("Tailscale IP", value: ip)
                }

                LabeledContent("ID", value: node.id)
            }

            if !node.capabilities.isEmpty {
                Section("Capabilities") {
                    ForEach(node.capabilities, id: \.self) { capability in
                        Label(capability, systemImage: "checkmark.circle")
                    }
                }
            }

            // Node Actions
            Section("Actions") {
                if viewModel.nodeActionInProgress == node.id {
                    HStack {
                        ProgressView()
                        Text("Processing...")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    switch node.status {
                    case .online, .busy:
                        Button {
                            showDrainConfirmation = true
                        } label: {
                            Label("Drain Node", systemImage: "arrow.down.to.line")
                        }

                        Button(role: .destructive) {
                            showForceOfflineConfirmation = true
                        } label: {
                            Label("Force Offline", systemImage: "power")
                        }

                    case .draining:
                        Button {
                            Task {
                                do {
                                    try await viewModel.enableNode(node.id)
                                } catch {
                                    actionError = error
                                }
                            }
                        } label: {
                            Label("Enable Node", systemImage: "play.circle")
                        }

                        Button(role: .destructive) {
                            showForceOfflineConfirmation = true
                        } label: {
                            Label("Force Offline", systemImage: "power")
                        }

                    case .offline:
                        Button {
                            Task {
                                do {
                                    try await viewModel.enableNode(node.id)
                                } catch {
                                    actionError = error
                                }
                            }
                        } label: {
                            Label("Enable Node", systemImage: "play.circle")
                        }
                    }
                }

                if let actionError {
                    Text(actionError.localizedDescription)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle(node.hostname)
        .navigationBarTitleDisplayMode(.inline)
        .alert("Drain Node?", isPresented: $showDrainConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Drain", role: .destructive) {
                Task {
                    do {
                        try await viewModel.drainNode(node.id)
                    } catch {
                        actionError = error
                    }
                }
            }
        } message: {
            Text("This will stop \(node.hostname) from accepting new tasks. Running tasks will complete.")
        }
        .alert("Force Offline?", isPresented: $showForceOfflineConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Force Offline", role: .destructive) {
                Task {
                    do {
                        try await viewModel.forceNodeOffline(node.id)
                    } catch {
                        actionError = error
                    }
                }
            }
        } message: {
            Text("This will immediately take \(node.hostname) offline. Running tasks may be interrupted.")
        }
    }

    private var statusDisplayName: String {
        switch node.status {
        case .online: return "Online"
        case .offline: return "Offline"
        case .busy: return "Busy"
        case .draining: return "Draining"
        }
    }
}

// MARK: - Preview

#Preview {
    StatusView()
        .environment(AppState())
}
