import SwiftUI

/// View displaying system status and node information
struct StatusView: View {
    @StateObject private var viewModel = StatusViewModel()
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationStack {
            List {
                // Connection status section
                connectionSection

                // System overview section
                systemOverviewSection

                // Nodes section
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
            // Status indicator
            Circle()
                .fill(statusColor)
                .frame(width: 10, height: 10)

            // Node info
            VStack(alignment: .leading, spacing: 2) {
                Text(node.hostname)
                    .font(.headline)

                HStack(spacing: 8) {
                    Text(node.status.displayName)
                        .font(.caption)
                        .foregroundStyle(statusColor)

                    if let platform = node.platform {
                        Text(platform)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            // Load indicator
            if let load = node.load {
                loadGauge(load: load)
            }
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
        case .maintenance:
            return .yellow
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

    var body: some View {
        List {
            Section("Status") {
                LabeledContent("Status", value: node.status.displayName)
                LabeledContent("Last Seen", value: viewModel.lastSeenText(for: node))

                if let load = node.load {
                    HStack {
                        Text("Load")
                        Spacer()
                        Gauge(value: load) {
                            Text(viewModel.loadText(for: node))
                        }
                        .gaugeStyle(.accessoryLinearCapacity)
                        .frame(width: 100)
                    }
                }
            }

            Section("Information") {
                LabeledContent("Hostname", value: node.hostname)

                if let platform = node.platform {
                    LabeledContent("Platform", value: platform)
                }

                if let version = node.version {
                    LabeledContent("Version", value: version)
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
        }
        .navigationTitle(node.hostname)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Preview

#Preview {
    StatusView()
        .environmentObject(AppState())
}
