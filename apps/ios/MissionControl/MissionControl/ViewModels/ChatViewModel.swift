import Foundation
import Combine

/// View model for managing chat conversations and messages
@MainActor
final class ChatViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published private(set) var messages: [Message] = []
    @Published private(set) var conversations: [Conversation] = []
    @Published private(set) var currentConversationId: String?
    @Published private(set) var isLoading = false
    @Published private(set) var isSending = false
    @Published var error: Error?

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
            role: .user,
            content: content,
            conversationId: currentConversationId
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
                conversationId: response.conversationId
            )
            messages.append(assistantMessage)

            // Refresh conversations list to include new/updated conversation
            await loadConversations()

        } catch {
            // Remove the optimistically added user message on error
            messages.removeLast()

            // Add error message
            let errorMessage = Message(
                role: .system,
                content: "Error: \(error.localizedDescription)"
            )
            messages.append(errorMessage)

            self.error = error
        }

        isSending = false
    }

    /// Delete a conversation
    func deleteConversation(_ conversation: Conversation) async {
        // Remove locally first
        conversations.removeAll { $0.id == conversation.id }

        // If it was the current conversation, clear messages
        if currentConversationId == conversation.id {
            startNewConversation()
        }

        // Note: API call would go here for server-side deletion
    }

    /// Clear all messages from the current view
    func clearMessages() {
        messages = []
        error = nil
    }

    /// Retry sending the last message if it failed
    func retryLastMessage() async {
        // Find the last user message
        guard let lastUserMessage = messages.last(where: { $0.role == .user }) else {
            return
        }

        // Remove any error messages
        messages.removeAll { $0.role == .system }

        // Remove the last user message to resend it
        messages.removeAll { $0.id == lastUserMessage.id }

        // Resend
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
