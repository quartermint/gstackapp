import Foundation
import Observation
import MissionControlNetworking

/// Filter options for task list
enum TaskFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case active = "Active"
    case pending = "Pending"
    case running = "Running"
    case completed = "Completed"
    case failed = "Failed"

    var id: String { rawValue }

    /// Convert filter to API status parameter
    var statusFilter: TaskStatus? {
        switch self {
        case .all, .active:
            return nil
        case .pending:
            return .pending
        case .running:
            return .running
        case .completed:
            return .completed
        case .failed:
            return .failed
        }
    }
}

/// View model for managing and displaying tasks
@MainActor
@Observable
final class TasksViewModel {
    // MARK: - Properties

    private(set) var tasks: [MCTask] = []
    private(set) var isLoading = false
    var error: Error?
    var filter: TaskFilter = .all {
        didSet {
            applyFilter()
        }
    }
    var searchText: String = "" {
        didSet {
            applyFilter()
        }
    }

    /// Filtered tasks based on current filter and search
    private(set) var filteredTasks: [MCTask] = []

    /// Timestamp of last refresh
    private(set) var lastUpdated: Date?

    // MARK: - Computed Properties

    /// Count of active (pending, running) tasks
    var activeTaskCount: Int {
        tasks.filter { isTaskActive($0) }.count
    }

    /// Count of completed tasks
    var completedTaskCount: Int {
        tasks.filter { $0.status == .completed }.count
    }

    /// Count of failed tasks
    var failedTaskCount: Int {
        tasks.filter { $0.status == .failed }.count
    }

    // MARK: - Dependencies

    private let apiClient: APIClient
    private var refreshTask: Task<Void, Never>?
    private var autoRefreshEnabled = false

    // MARK: - Initialization

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    // Cleanup handled by view's onDisappear calling stopAutoRefresh()

    // MARK: - Public Methods

    /// Refresh task list from server
    func refresh() async {
        isLoading = true
        error = nil

        do {
            tasks = try await apiClient.getTasks()
            lastUpdated = Date()
            applyFilter()
        } catch {
            self.error = error
        }

        isLoading = false
    }

    /// Load a specific task by ID
    func loadTask(id: String) async -> MCTask? {
        do {
            return try await apiClient.getTask(id: id)
        } catch {
            self.error = error
            return nil
        }
    }

    /// Start automatic refresh at specified interval
    func startAutoRefresh(interval: TimeInterval = 10) {
        stopAutoRefresh()
        autoRefreshEnabled = true

        refreshTask = Task {
            while !Task.isCancelled && autoRefreshEnabled {
                await refresh()
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            }
        }
    }

    /// Stop automatic refresh
    func stopAutoRefresh() {
        autoRefreshEnabled = false
        refreshTask?.cancel()
        refreshTask = nil
    }

    /// Clear any displayed error
    func clearError() {
        error = nil
    }

    // MARK: - Task Actions

    /// Cancel a pending or running task
    func cancelTask(_ taskId: String) async throws {
        _ = try await apiClient.cancelTask(taskId: taskId)
        await refresh()
    }

    /// Retry a failed or cancelled task
    func retryTask(_ taskId: String) async throws {
        _ = try await apiClient.retryTask(taskId: taskId)
        await refresh()
    }

    // MARK: - Private Methods

    /// Check if a task is active
    private func isTaskActive(_ task: MCTask) -> Bool {
        switch task.status {
        case .pending, .running:
            return true
        case .completed, .failed, .cancelled:
            return false
        }
    }

    /// Apply current filter and search to tasks
    private func applyFilter() {
        var result = tasks

        switch filter {
        case .all:
            break
        case .active:
            result = result.filter { isTaskActive($0) }
        case .pending:
            result = result.filter { $0.status == .pending }
        case .running:
            result = result.filter { $0.status == .running }
        case .completed:
            result = result.filter { $0.status == .completed }
        case .failed:
            result = result.filter { $0.status == .failed }
        }

        if !searchText.isEmpty {
            let lowercasedSearch = searchText.lowercased()
            result = result.filter { task in
                task.command.lowercased().contains(lowercasedSearch) ||
                task.id.lowercased().contains(lowercasedSearch) ||
                task.requestId.lowercased().contains(lowercasedSearch)
            }
        }

        result.sort { $0.createdAt > $1.createdAt }

        filteredTasks = result
    }
}

// MARK: - Task Formatting

extension TasksViewModel {
    /// Format task creation time for display
    func createdAtText(for task: MCTask) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: task.createdAt, relativeTo: Date())
    }

    /// Format task duration if completed
    func durationText(for task: MCTask) -> String? {
        guard task.status == .completed || task.status == .failed else {
            return nil
        }

        let duration = task.updatedAt.timeIntervalSince(task.createdAt)
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = [.minute, .second]
        formatter.unitsStyle = .abbreviated
        return formatter.string(from: duration)
    }

    /// Get status icon name for a task
    func statusIcon(for task: MCTask) -> String {
        switch task.status {
        case .pending:
            return "clock"
        case .running:
            return "arrow.triangle.2.circlepath"
        case .completed:
            return "checkmark.circle.fill"
        case .failed:
            return "xmark.circle.fill"
        case .cancelled:
            return "slash.circle"
        }
    }

    /// Get status color name for a task
    func statusColorName(for task: MCTask) -> String {
        switch task.status {
        case .pending:
            return "yellow"
        case .running:
            return "blue"
        case .completed:
            return "green"
        case .failed:
            return "red"
        case .cancelled:
            return "gray"
        }
    }

    /// Get display name for task status
    func statusDisplayName(for task: MCTask) -> String {
        switch task.status {
        case .pending:
            return "Pending"
        case .running:
            return "Running"
        case .completed:
            return "Completed"
        case .failed:
            return "Failed"
        case .cancelled:
            return "Cancelled"
        }
    }
}
