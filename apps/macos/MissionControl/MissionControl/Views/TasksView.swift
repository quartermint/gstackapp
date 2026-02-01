//
//  TasksView.swift
//  MissionControl
//
//  Task queue browser with filtering and task creation.
//

import SwiftUI

/// Task queue browser view
struct TasksView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTask: TaskItem?
    @State private var filterStatus: TaskStatus?
    @State private var searchText: String = ""
    @State private var showingCreateTask = false
    @State private var isRefreshing = false

    private var filteredTasks: [TaskItem] {
        var tasks = appState.tasks

        // Filter by status
        if let status = filterStatus {
            tasks = tasks.filter { $0.status == status }
        }

        // Filter by search text
        if !searchText.isEmpty {
            tasks = tasks.filter {
                $0.type.localizedCaseInsensitiveContains(searchText) ||
                $0.payload.localizedCaseInsensitiveContains(searchText)
            }
        }

        return tasks.sorted { $0.createdAt > $1.createdAt }
    }

    var body: some View {
        HSplitView {
            // Task list
            TaskListView(
                tasks: filteredTasks,
                selectedTask: $selectedTask,
                filterStatus: $filterStatus,
                searchText: $searchText,
                onRefresh: refreshTasks
            )
            .frame(minWidth: 300, maxWidth: 400)

            // Task details
            if let task = selectedTask {
                TaskDetailView(task: task, onCancel: cancelTask)
            } else {
                EmptyTaskDetailView()
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: { showingCreateTask = true }) {
                    Image(systemName: "plus")
                }
                .help("Create Task")
            }

            ToolbarItem(placement: .automatic) {
                Button(action: refreshTasks) {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(isRefreshing)
                .help("Refresh Tasks")
            }
        }
        .sheet(isPresented: $showingCreateTask) {
            CreateTaskSheet(onSubmit: createTask)
        }
        .onAppear {
            refreshTasks()
        }
    }

    private func refreshTasks() {
        isRefreshing = true
        Task {
            do {
                let tasks = try await appState.apiClient.listTasks()
                await MainActor.run {
                    appState.tasks = tasks
                    isRefreshing = false
                }
            } catch {
                await MainActor.run {
                    isRefreshing = false
                }
            }
        }
    }

    private func createTask(_ type: String, _ payload: String) {
        Task {
            do {
                let newTask = try await appState.apiClient.createTask(type: type, payload: payload)
                await MainActor.run {
                    appState.tasks.insert(newTask, at: 0)
                    selectedTask = newTask
                    showingCreateTask = false
                }
            } catch {
                // TODO: Show error
            }
        }
    }

    private func cancelTask(_ task: TaskItem) {
        Task {
            do {
                try await appState.apiClient.cancelTask(id: task.id)
                await MainActor.run {
                    if let index = appState.tasks.firstIndex(where: { $0.id == task.id }) {
                        appState.tasks[index] = TaskItem(
                            id: task.id,
                            type: task.type,
                            status: .failed,
                            payload: task.payload,
                            assignedNode: task.assignedNode,
                            createdAt: task.createdAt,
                            updatedAt: Date()
                        )
                    }
                }
            } catch {
                // TODO: Show error
            }
        }
    }
}

/// Task list sidebar
struct TaskListView: View {
    let tasks: [TaskItem]
    @Binding var selectedTask: TaskItem?
    @Binding var filterStatus: TaskStatus?
    @Binding var searchText: String
    let onRefresh: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Header with filter
            VStack(spacing: 12) {
                HStack {
                    Text("Tasks")
                        .font(.headline)
                    Spacer()
                    Text("\(tasks.count) tasks")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                // Search bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                    TextField("Search tasks...", text: $searchText)
                        .textFieldStyle(.plain)
                }
                .padding(8)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.secondary.opacity(0.1))
                )

                // Filter chips
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(
                            title: "All",
                            isSelected: filterStatus == nil,
                            action: { filterStatus = nil }
                        )

                        ForEach(TaskStatus.allCases, id: \.self) { status in
                            FilterChip(
                                title: status.rawValue.capitalized,
                                isSelected: filterStatus == status,
                                color: status.color,
                                action: { filterStatus = status }
                            )
                        }
                    }
                }
            }
            .padding()

            Divider()

            // Task list
            List(selection: $selectedTask) {
                ForEach(tasks) { task in
                    TaskRow(task: task)
                        .tag(task)
                }
            }
            .listStyle(.sidebar)
        }
        .background(Color(NSColor.controlBackgroundColor))
    }
}

/// Filter chip button
struct FilterChip: View {
    let title: String
    let isSelected: Bool
    var color: Color = .accentColor
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(isSelected ? color.opacity(0.2) : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(isSelected ? color : Color.secondary.opacity(0.3), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .foregroundColor(isSelected ? color : .secondary)
    }
}

/// Single task row
struct TaskRow: View {
    let task: TaskItem

    var body: some View {
        HStack(spacing: 12) {
            // Status indicator
            Circle()
                .fill(task.status.color)
                .frame(width: 10, height: 10)

            VStack(alignment: .leading, spacing: 4) {
                Text(task.type)
                    .font(.body)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Text(task.status.rawValue.capitalized)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    if let node = task.assignedNode {
                        Text("on \(node)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }

            Spacer()

            Text(task.createdAt, style: .relative)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
}

/// Task detail view
struct TaskDetailView: View {
    let task: TaskItem
    let onCancel: (TaskItem) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(task.type)
                            .font(.title2)
                            .fontWeight(.semibold)

                        HStack(spacing: 8) {
                            StatusBadge(status: task.status)

                            if let node = task.assignedNode {
                                Text("Assigned to \(node)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }

                    Spacer()

                    if task.status == .pending || task.status == .running {
                        Button("Cancel", action: { onCancel(task) })
                            .buttonStyle(.bordered)
                            .tint(.red)
                    }
                }

                Divider()

                // Timeline
                VStack(alignment: .leading, spacing: 8) {
                    Text("Timeline")
                        .font(.headline)

                    HStack {
                        Image(systemName: "clock")
                            .foregroundColor(.secondary)
                        Text("Created")
                        Spacer()
                        Text(task.createdAt, style: .date)
                        Text(task.createdAt, style: .time)
                    }
                    .font(.caption)

                    HStack {
                        Image(systemName: "clock.arrow.circlepath")
                            .foregroundColor(.secondary)
                        Text("Updated")
                        Spacer()
                        Text(task.updatedAt, style: .date)
                        Text(task.updatedAt, style: .time)
                    }
                    .font(.caption)
                }

                // Payload
                VStack(alignment: .leading, spacing: 8) {
                    Text("Payload")
                        .font(.headline)

                    ScrollView(.horizontal, showsIndicators: false) {
                        Text(task.payload)
                            .font(.system(.body, design: .monospaced))
                            .textSelection(.enabled)
                    }
                    .padding()
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(NSColor.textBackgroundColor))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                    )
                }

                // Actions
                HStack(spacing: 12) {
                    Button("Copy ID") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(task.id, forType: .string)
                    }
                    .buttonStyle(.bordered)

                    Button("Copy Payload") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(task.payload, forType: .string)
                    }
                    .buttonStyle(.bordered)

                    Spacer()
                }

                Spacer()
            }
            .padding()
        }
    }
}

/// Status badge component
struct StatusBadge: View {
    let status: TaskStatus

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(status.color)
                .frame(width: 6, height: 6)
            Text(status.rawValue.capitalized)
                .font(.caption)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(status.color.opacity(0.1))
        )
    }
}

/// Empty state for task details
struct EmptyTaskDetailView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "checklist")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("Select a task to view details")
                .font(.headline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Create task sheet
struct CreateTaskSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var taskType: String = ""
    @State private var payload: String = ""

    let onSubmit: (String, String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Create Task")
                    .font(.headline)
                Spacer()
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding()

            Divider()

            // Form
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Task Type")
                        .font(.subheadline)
                        .fontWeight(.medium)

                    TextField("e.g., code-analysis, shell-command", text: $taskType)
                        .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Payload (JSON)")
                        .font(.subheadline)
                        .fontWeight(.medium)

                    TextEditor(text: $payload)
                        .font(.system(.body, design: .monospaced))
                        .frame(minHeight: 150)
                        .padding(4)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                        )
                }
            }
            .padding()

            Divider()

            // Actions
            HStack {
                Button("Cancel") {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)

                Spacer()

                Button("Create Task") {
                    onSubmit(taskType, payload)
                }
                .buttonStyle(.borderedProminent)
                .disabled(taskType.isEmpty || payload.isEmpty)
                .keyboardShortcut(.defaultAction)
            }
            .padding()
        }
        .frame(width: 500, height: 400)
    }
}

// MARK: - TaskStatus Extensions

extension TaskStatus: CaseIterable {
    static var allCases: [TaskStatus] = [.pending, .assigned, .running, .completed, .failed]

    var color: Color {
        switch self {
        case .pending: return .yellow
        case .assigned: return .blue
        case .running: return .orange
        case .completed: return .green
        case .failed: return .red
        }
    }
}

// MARK: - Hashable Conformance

extension TaskItem: Hashable {
    static func == (lhs: TaskItem, rhs: TaskItem) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Preview

#Preview {
    TasksView()
        .environmentObject(AppState())
}
