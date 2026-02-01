import Foundation

/// Status of a task in the orchestration system
enum TaskStatus: String, Codable, CaseIterable {
    case pending
    case queued
    case running
    case completed
    case failed
    case cancelled

    var displayName: String {
        switch self {
        case .pending: return "Pending"
        case .queued: return "Queued"
        case .running: return "Running"
        case .completed: return "Completed"
        case .failed: return "Failed"
        case .cancelled: return "Cancelled"
        }
    }

    var isActive: Bool {
        switch self {
        case .pending, .queued, .running:
            return true
        case .completed, .failed, .cancelled:
            return false
        }
    }
}

/// A task in the Mission Control orchestration system
struct MCTask: Identifiable, Codable, Equatable {
    let id: String
    let requestId: String
    let command: String
    let status: TaskStatus
    let nodeId: String?
    let result: String?
    let error: String?
    let createdAt: Date
    let updatedAt: Date?
    let completedAt: Date?

    init(
        id: String = UUID().uuidString,
        requestId: String,
        command: String,
        status: TaskStatus = .pending,
        nodeId: String? = nil,
        result: String? = nil,
        error: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date? = nil,
        completedAt: Date? = nil
    ) {
        self.id = id
        self.requestId = requestId
        self.command = command
        self.status = status
        self.nodeId = nodeId
        self.result = result
        self.error = error
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.completedAt = completedAt
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case requestId
        case command
        case status
        case nodeId
        case result
        case error
        case createdAt
        case updatedAt
        case completedAt
    }
}

/// Response containing a list of tasks
struct TaskListResponse: Codable {
    let tasks: [MCTask]
    let total: Int?
}
