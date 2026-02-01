import Foundation
import Combine

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
final class TasksViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published private(set) var tasks: [MCTask] = []
    @Published private(set) var isLoading = false
    @Published var error: Error?
    @Published var filter: TaskFilter = .all {
        didSet {
            applyFilter()
        }
    }
    @Published var searchText: String = "" {
        didSet {
            applyFilter()
        }
    }

    /// Filtered tasks based on current filter and search
    @Published private(set) var filteredTasks: [MCTask] = []

    /// Timestamp of last refresh
    @Published private(set) var lastUpdated: Date?

    // MARK: - Computed Properties

    /// Count of active (pending, queued, running) tasks
    var activeTaskCount: Int {
        tasks.filter { $0.status.isActive }.count
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

    deinit {
        refreshTask?.cancel()
    }

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

    // MARK: - Private Methods

    /// Apply current filter and search to tasks
    private func applyFilter() {
        var result = tasks

        // Apply status filter
        switch filter {
        case .all:
            break
        case .active:
            result = result.filter { $0.status.isActive }
        case .pending:
            result = result.filter { $0.status == .pending }
        case .running:
            result = result.filter { $0.status == .running }
        case .completed:
            result = result.filter { $0.status == .completed }
        case .failed:
            result = result.filter { $0.status == .failed }
        }

        // Apply search filter
        if !searchText.isEmpty {
            let lowercasedSearch = searchText.lowercased()
            result = result.filter { task in
                task.command.lowercased().contains(lowercasedSearch) ||
                task.id.lowercased().contains(lowercasedSearch) ||
                task.requestId.lowercased().contains(lowercasedSearch)
            }
        }

        // Sort by creation date, newest first
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
        guard let completedAt = task.completedAt else {
            return nil
        }

        let duration = completedAt.timeIntervalSince(task.createdAt)
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
        case .queued:
            return "list.bullet"
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
        case .pending, .queued:
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
}
