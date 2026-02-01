import Foundation

/// Role of the message sender in a conversation
enum MessageRole: String, Codable, CaseIterable {
    case user
    case assistant
    case system
}

/// A chat message in a conversation
struct Message: Identifiable, Codable, Equatable {
    let id: String
    let role: MessageRole
    let content: String
    let timestamp: Date
    let conversationId: String?

    init(
        id: String = UUID().uuidString,
        role: MessageRole,
        content: String,
        timestamp: Date = Date(),
        conversationId: String? = nil
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.timestamp = timestamp
        self.conversationId = conversationId
    }

    enum CodingKeys: String, CodingKey {
        case id
        case role
        case content
        case timestamp
        case conversationId
    }
}

/// Request payload for sending a chat message
struct ChatRequest: Codable {
    let message: String
    let conversationId: String?

    init(message: String, conversationId: String? = nil) {
        self.message = message
        self.conversationId = conversationId
    }
}

/// Response from the chat API
struct ChatResponse: Codable {
    let message: String
    let conversationId: String
    let messageId: String?

    enum CodingKeys: String, CodingKey {
        case message
        case conversationId
        case messageId
    }
}
