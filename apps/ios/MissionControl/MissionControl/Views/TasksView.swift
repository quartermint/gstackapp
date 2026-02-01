import SwiftUI
import MissionControlNetworking

/// View displaying task list with filtering
struct TasksView: View {
    @StateObject private var viewModel = TasksViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Filter chips
                filterBar

                // Task list
                taskList
            }
            .navigationTitle("Tasks")
            .searchable(text: $viewModel.searchText, prompt: "Search tasks")
            .refreshable {
                await viewModel.refresh()
            }
            .task {
                await viewModel.refresh()
                viewModel.startAutoRefresh(interval: 10)
            }
            .onDisappear {
                viewModel.stopAutoRefresh()
            }
        }
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(TaskFilter.allCases) { filter in
                    FilterChip(
                        title: filter.rawValue,
                        count: countForFilter(filter),
                        isSelected: viewModel.filter == filter
                    ) {
                        withAnimation {
                            viewModel.filter = filter
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(Color(.systemBackground))
    }

    private func countForFilter(_ filter: TaskFilter) -> Int? {
        switch filter {
        case .all:
            return viewModel.tasks.count
        case .active:
            return viewModel.activeTaskCount
        case .pending:
            return viewModel.tasks.filter { $0.status == .pending }.count
        case .running:
            return viewModel.tasks.filter { $0.status == .running }.count
        case .completed:
            return viewModel.completedTaskCount
        case .failed:
            return viewModel.failedTaskCount
        }
    }

    // MARK: - Task List

    private var taskList: some View {
        Group {
            if viewModel.isLoading && viewModel.tasks.isEmpty {
                loadingView
            } else if viewModel.filteredTasks.isEmpty {
                emptyView
            } else {
                List {
                    ForEach(viewModel.filteredTasks) { task in
                        NavigationLink {
                            TaskDetailView(task: task, viewModel: viewModel)
                        } label: {
                            TaskRow(task: task, viewModel: viewModel)
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Loading tasks...")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyView: some View {
        ContentUnavailableView {
            Label("No Tasks", systemImage: "list.bullet.rectangle")
        } description: {
            if viewModel.filter != .all || !viewModel.searchText.isEmpty {
                Text("No tasks match your current filters")
            } else {
                Text("Tasks will appear here when created")
            }
        } actions: {
            if viewModel.filter != .all {
                Button("Show All Tasks") {
                    viewModel.filter = .all
                    viewModel.searchText = ""
                }
            }
        }
    }
}

// MARK: - Filter Chip

struct FilterChip: View {
    let title: String
    let count: Int?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(title)
                    .font(.subheadline)

                if let count = count, count > 0 {
                    Text("\(count)")
                        .font(.caption)
                        .fontWeight(.medium)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(isSelected ? Color.white.opacity(0.3) : Color(.systemGray5))
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? Color.blue : Color(.systemGray6))
            .foregroundStyle(isSelected ? .white : .primary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Task Row

struct TaskRow: View {
    let task: MCTask
    let viewModel: TasksViewModel

    var body: some View {
        HStack(spacing: 12) {
            // Status icon
            Image(systemName: viewModel.statusIcon(for: task))
                .font(.title3)
                .foregroundStyle(statusColor)
                .frame(width: 24)

            // Task info
            VStack(alignment: .leading, spacing: 4) {
                Text(task.command)
                    .font(.headline)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Text(viewModel.statusDisplayName(for: task))
                        .font(.caption)
                        .foregroundStyle(statusColor)

                    Text(viewModel.createdAtText(for: task))
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let duration = viewModel.durationText(for: task) {
                        Text(duration)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            // Running indicator
            if task.status == .running {
                ProgressView()
                    .scaleEffect(0.8)
            }
        }
        .padding(.vertical, 4)
    }

    private var statusColor: Color {
        switch task.status {
        case .pending:
            return .yellow
        case .running:
            return .blue
        case .completed:
            return .green
        case .failed:
            return .red
        case .cancelled:
            return .gray
        }
    }
}

// MARK: - Task Detail View

struct TaskDetailView: View {
    let task: MCTask
    let viewModel: TasksViewModel

    var body: some View {
        List {
            Section("Command") {
                Text(task.command)
                    .font(.system(.body, design: .monospaced))
                    .textSelection(.enabled)
            }

            Section("Status") {
                LabeledContent("Status") {
                    HStack {
                        Image(systemName: viewModel.statusIcon(for: task))
                        Text(viewModel.statusDisplayName(for: task))
                    }
                    .foregroundStyle(statusColor)
                }

                LabeledContent("Created", value: task.createdAt, format: .dateTime)
                LabeledContent("Updated", value: task.updatedAt, format: .dateTime)

                if let duration = viewModel.durationText(for: task) {
                    LabeledContent("Duration", value: duration)
                }
            }

            Section("Details") {
                LabeledContent("Task ID", value: task.id)
                LabeledContent("Request ID", value: task.requestId)

                if let nodeId = task.nodeId {
                    LabeledContent("Node ID", value: nodeId)
                }
            }

            if let result = task.result {
                Section("Result") {
                    if let stdout = result.stdout, !stdout.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Output:")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(stdout)
                                .font(.system(.caption, design: .monospaced))
                                .textSelection(.enabled)
                        }
                    }

                    if let exitCode = result.exitCode {
                        LabeledContent("Exit Code", value: "\(exitCode)")
                    }

                    if let errorMessage = result.errorMessage, !errorMessage.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Error:")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(errorMessage)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.red)
                                .textSelection(.enabled)
                        }
                    }
                }
            }
        }
        .navigationTitle("Task Details")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var statusColor: Color {
        switch task.status {
        case .pending:
            return .yellow
        case .running:
            return .blue
        case .completed:
            return .green
        case .failed:
            return .red
        case .cancelled:
            return .gray
        }
    }
}

// MARK: - Preview

#Preview {
    TasksView()
}
