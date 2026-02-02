import Foundation
import Combine
import MissionControlNetworking

/// iOS-specific API client that extends the shared BaseAPIClient
/// Adds @Published properties for SwiftUI integration
@MainActor
final class APIClient: BaseAPIClient, ObservableObject {
    static let shared = APIClient()

    @Published var isConnected = false
    @Published private(set) var baseURLValue: URL

    override init(configuration: APIConfiguration = .default) {
        // Initialize Published wrapper directly to avoid actor isolation issues
        self._baseURLValue = Published(wrappedValue: configuration.baseURL)
        super.init(configuration: configuration)
    }

    // MARK: - Configuration

    /// Update the base URL for the Hub
    func setBaseURL(_ url: URL) {
        // Create new configuration with updated URL
        let newConfig = APIConfiguration(
            baseURL: url,
            defaultHeaders: configuration.defaultHeaders,
            timeoutInterval: configuration.timeoutInterval
        )
        // Reinitialize with new configuration
        self.baseURLValue = url
    }

    /// Get current base URL
    var baseURL: URL {
        baseURLValue
    }

    // MARK: - Chat API

    /// Send a chat message
    func chat(message: String, conversationId: String? = nil) async throws -> ChatResponse {
        let requestBody = ChatRequest(message: message, conversationId: conversationId)
        return try await request("/chat", method: .post, body: requestBody, authenticated: true)
    }

    // MARK: - Conversations API

    /// Get all conversations
    func getConversations() async throws -> [Conversation] {
        let response: ConversationListResponse = try await request("/conversations", authenticated: true)
        return response.conversations
    }

    /// Get messages for a conversation
    func getConversationMessages(conversationId: String) async throws -> [Message] {
        let response: ConversationMessagesResponse = try await request("/conversations/\(conversationId)/messages", authenticated: true)
        return response.messages
    }

    // MARK: - Nodes API

    /// Get all nodes
    func getNodes() async throws -> [Node] {
        let response: NodeListResponse = try await request("/admin/nodes", authenticated: true)
        return response.nodes
    }

    /// Get system health status
    func getHealth() async throws -> SystemStatus {
        return try await request("/health", authenticated: false)
    }

    // MARK: - Tasks API

    /// Get all tasks
    func getTasks(status: TaskStatus? = nil) async throws -> [MCTask] {
        var path = "/tasks"
        if let status = status {
            path += "?status=\(status.rawValue)"
        }
        let response: TaskListResponse = try await request(path, authenticated: true)
        return response.tasks
    }

    /// Get a specific task
    func getTask(id: String) async throws -> MCTask {
        return try await request("/tasks/\(id)", authenticated: true)
    }

    // MARK: - Authentication API

    /// Login with username and password
    func login(username: String, password: String) async throws -> AuthResponse {
        let requestBody = LoginRequest(username: username, password: password)
        return try await request("/auth/token", method: .post, body: requestBody, authenticated: false)
    }

    /// Refresh access token
    func refreshToken(refreshToken: String) async throws -> AuthResponse {
        let requestBody = RefreshTokenRequest(refreshToken: refreshToken)
        return try await request("/auth/refresh", method: .post, body: requestBody, authenticated: false)
    }

    /// Register device for push notifications
    func registerDevice(token: String) async throws {
        let requestBody = RegisterDeviceRequest(deviceToken: token, platform: "ios")
        let _: EmptyResponse = try await request("/devices/register", method: .post, body: requestBody, authenticated: true)
    }

    // MARK: - Connection Check

    /// Check if the Hub is reachable
    func checkConnection() async {
        do {
            let _: SystemStatus = try await request("/health", authenticated: false)
            isConnected = true
        } catch {
            isConnected = false
        }
    }
}

// MARK: - Request/Response Types

/// Request payload for sending a chat message
struct ChatRequest: Codable {
    let message: String
    let conversationId: String?
}

/// Response from the chat API
struct ChatResponse: Codable {
    let message: String
    let conversationId: String
    let messageId: String?
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

/// Response containing a list of nodes
struct NodeListResponse: Codable {
    let nodes: [Node]
}

/// Response containing a list of tasks
struct TaskListResponse: Codable {
    let tasks: [MCTask]
    let total: Int?
}

/// Request payload for login
struct LoginRequest: Codable {
    let username: String
    let password: String
}

/// Response from login/refresh endpoints
struct AuthResponse: Codable {
    let accessToken: String
    let refreshToken: String?
    let expiresIn: Int?
}

/// Request for token refresh
struct RefreshTokenRequest: Codable {
    let refreshToken: String
}

/// Request for device registration
struct RegisterDeviceRequest: Codable {
    let deviceToken: String
    let platform: String
}

/// Empty response type
struct EmptyResponse: Codable {}
