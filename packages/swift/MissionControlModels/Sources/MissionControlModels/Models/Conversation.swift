import Foundation

public struct Conversation: Identifiable, Codable, Equatable {
    public let id: String
    public let title: String
    public let userId: String
    public let createdAt: Date
    public let updatedAt: Date
    public var metadata: [String: AnyCodable]?

    public init(id: String, title: String, userId: String, createdAt: Date, updatedAt: Date, metadata: [String: AnyCodable]? = nil) {
        self.id = id
        self.title = title
        self.userId = userId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.metadata = metadata
    }

    enum CodingKeys: String, CodingKey {
        case id, title, userId, createdAt, updatedAt, metadata
    }
}
