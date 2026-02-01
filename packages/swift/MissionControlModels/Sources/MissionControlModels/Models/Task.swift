import Foundation

public enum TaskStatus: String, Codable {
    case pending
    case running
    case completed
    case failed
    case cancelled
}

public struct MCTask: Identifiable, Codable, Equatable {
    public let id: String
    public let requestId: String
    public let command: String
    public let status: TaskStatus
    public let createdAt: Date
    public let updatedAt: Date
    public var nodeId: String?
    public var result: TaskResult?

    public init(id: String, requestId: String, command: String, status: TaskStatus, createdAt: Date, updatedAt: Date, nodeId: String? = nil, result: TaskResult? = nil) {
        self.id = id
        self.requestId = requestId
        self.command = command
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.nodeId = nodeId
        self.result = result
    }

    enum CodingKeys: String, CodingKey {
        case id = "taskId"
        case requestId, command, status, createdAt, updatedAt, nodeId, result
    }
}

public struct TaskResult: Codable, Equatable {
    public var exitCode: Int?
    public var stdout: String?
    public var stderr: String?
    public var errorMessage: String?

    public init(exitCode: Int? = nil, stdout: String? = nil, stderr: String? = nil, errorMessage: String? = nil) {
        self.exitCode = exitCode
        self.stdout = stdout
        self.stderr = stderr
        self.errorMessage = errorMessage
    }
}
