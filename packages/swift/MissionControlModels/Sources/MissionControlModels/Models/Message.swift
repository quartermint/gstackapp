import Foundation

public enum MessageRole: String, Codable {
    case user
    case assistant
    case system
}

public struct Message: Identifiable, Codable, Equatable {
    public let id: String
    public let role: MessageRole
    public let content: String
    public let createdAt: Date
    public var timestamp: TimeInterval?

    public init(id: String, role: MessageRole, content: String, createdAt: Date, timestamp: TimeInterval? = nil) {
        self.id = id
        self.role = role
        self.content = content
        self.createdAt = createdAt
        self.timestamp = timestamp
    }
}
