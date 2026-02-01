import Foundation

/// A conversation containing multiple messages
struct Conversation: Identifiable, Codable, Equatable {
    let id: String
    let title: String?
    let createdAt: Date
    let updatedAt: Date?
    let messageCount: Int

    init(
        id: String = UUID().uuidString,
        title: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date? = nil,
        messageCount: Int = 0
    ) {
        self.id = id
        self.title = title
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.messageCount = messageCount
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title
        case createdAt
        case updatedAt
        case messageCount
    }

    /// Display title, defaulting to date if no title set
    var displayTitle: String {
        if let title = title, !title.isEmpty {
            return title
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return "Conversation from \(formatter.string(from: createdAt))"
    }
}

/// Response containing a list of conversations
struct ConversationListResponse: Codable {
    let conversations: [Conversation]
    let total: Int?
}

/// Response containing messages for a conversation
struct ConversationMessagesResponse: Codable {
    let messages: [Message]
    let conversationId: String
}
