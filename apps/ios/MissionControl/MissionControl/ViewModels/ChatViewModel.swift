import Foundation
import Observation
import MissionControlNetworking

/// View model for managing chat conversations and messages
@MainActor
@Observable
final class ChatViewModel {
    // MARK: - Properties

    private(set) var messages: [Message] = []
    private(set) var conversations: [Conversation] = []
    private(set) var currentConversationId: String?
    private(set) var isLoading = false
    private(set) var isSending = false
    var error: Error?

    // MARK: - Dependencies

    private let apiClient: APIClient

    // MARK: - Initialization

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    // MARK: - Public Methods

    /// Load all conversations
    func loadConversations() async {
        isLoading = true
        error = nil

        do {
            conversations = try await apiClient.getConversations()
        } catch {
            self.error = error
        }

        isLoading = false
    }

    /// Load messages for a specific conversation
    func loadMessages(conversationId: String) async {
        isLoading = true
        error = nil
        currentConversationId = conversationId

        do {
            messages = try await apiClient.getConversationMessages(conversationId: conversationId)
        } catch {
            self.error = error
        }

        isLoading = false
    }

    /// Start a new conversation
    func startNewConversation() {
        currentConversationId = nil
        messages = []
        error = nil
    }

    /// Send a message in the current conversation
    func sendMessage(_ content: String) async {
        guard !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }

        isSending = true
        error = nil

        // Add user message immediately for responsive UI
        let userMessage = Message(
            id: UUID().uuidString,
            role: .user,
            content: content,
            createdAt: Date()
        )
        messages.append(userMessage)

        do {
            let response = try await apiClient.chat(
                message: content,
                conversationId: currentConversationId
            )

            // Update conversation ID if this is a new conversation
            if currentConversationId == nil {
                currentConversationId = response.conversationId
            }

            // Add assistant response
            let assistantMessage = Message(
                id: response.messageId ?? UUID().uuidString,
                role: .assistant,
                content: response.message,
                createdAt: Date()
            )
            messages.append(assistantMessage)

            // Refresh conversations list to include new/updated conversation
            await loadConversations()

        } catch {
            // Remove the optimistically added user message on error
            messages.removeLast()

            // Add error message
            let errorMessage = Message(
                id: UUID().uuidString,
                role: .system,
                content: "Error: \(error.localizedDescription)",
                createdAt: Date()
            )
            messages.append(errorMessage)

            self.error = error
        }

        isSending = false
    }

    /// Delete a conversation
    func deleteConversation(_ conversation: Conversation) async {
        conversations.removeAll { $0.id == conversation.id }

        if currentConversationId == conversation.id {
            startNewConversation()
        }
    }

    /// Clear all messages from the current view
    func clearMessages() {
        messages = []
        error = nil
    }

    /// Retry sending the last message if it failed
    func retryLastMessage() async {
        guard let lastUserMessage = messages.last(where: { $0.role == .user }) else {
            return
        }

        messages.removeAll { $0.role == .system }
        messages.removeAll { $0.id == lastUserMessage.id }

        await sendMessage(lastUserMessage.content)
    }
}

// MARK: - Conversation Selection

extension ChatViewModel {
    /// Select and load a conversation
    func selectConversation(_ conversation: Conversation) async {
        await loadMessages(conversationId: conversation.id)
    }

    /// Check if a conversation is currently selected
    func isSelected(_ conversation: Conversation) -> Bool {
        currentConversationId == conversation.id
    }
}
