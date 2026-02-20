import Foundation
import MissionControlNetworking

/// Hub API response envelope: { success: true, data: T }
private struct APIEnvelope<T: Decodable>: Decodable {
    let success: Bool
    let data: T
}

/// iOS-specific API client that extends the shared BaseAPIClient
@MainActor
final class APIClient: BaseAPIClient {
    static let shared = APIClient()

    private(set) var baseURLValue: URL

    override init(configuration: APIConfiguration = .default) {
        self.baseURLValue = configuration.baseURL
        super.init(configuration: configuration)
    }

    // MARK: - Configuration

    /// Update the base URL for the Hub
    func setBaseURL(_ url: URL) {
        self.baseURLValue = url
    }

    /// Get current base URL
    var baseURL: URL {
        baseURLValue
    }

    // MARK: - Envelope Helper

    /// Request that unwraps the Hub's {success, data} envelope
    private func requestData<T: Decodable>(
        _ endpoint: String,
        method: HTTPMethod = .get,
        body: Encodable? = nil,
        authenticated: Bool = true
    ) async throws -> T {
        let envelope: APIEnvelope<T> = try await request(endpoint, method: method, body: body, authenticated: authenticated)
        return envelope.data
    }

    // MARK: - Chat API

    /// Send a chat message
    func chat(message: String, conversationId: String? = nil) async throws -> ChatResponse {
        let requestBody = ChatRequest(message: message, conversationId: conversationId)
        return try await requestData("/chat", method: .post, body: requestBody, authenticated: true)
    }

    // MARK: - Conversations API

    /// Get all conversations
    func getConversations() async throws -> [Conversation] {
        let response: ConversationListResponse = try await requestData("/conversations", authenticated: true)
        return response.conversations
    }

    /// Get messages for a conversation
    func getConversationMessages(conversationId: String) async throws -> [Message] {
        let response: ConversationMessagesResponse = try await requestData("/conversations/\(conversationId)/messages", authenticated: true)
        return response.messages
    }

    // MARK: - Nodes API

    /// Get all nodes
    func getNodes() async throws -> [Node] {
        let response: NodeListResponse = try await requestData("/admin/nodes", authenticated: true)
        return response.nodes
    }

    /// Get system health status (no envelope — /health returns raw)
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
        let response: TaskListResponse = try await requestData(path, authenticated: true)
        return response.tasks
    }

    /// Get a specific task
    func getTask(id: String) async throws -> MCTask {
        return try await requestData("/tasks/\(id)", authenticated: true)
    }

    // MARK: - Task Dispatch

    /// Dispatch a new task to the cluster
    func dispatchTask(command: String, priority: Int = 50, timeoutMs: Int = 30000) async throws -> TaskDispatchResponse {
        let requestBody = TaskDispatchRequest(
            taskId: UUID().uuidString,
            requestId: UUID().uuidString,
            command: command,
            timeoutMs: timeoutMs,
            priority: priority
        )
        return try await requestData("/tasks", method: .post, body: requestBody, authenticated: true)
    }

    // MARK: - Admin Node Actions

    /// Drain a node (stop accepting new tasks)
    func drainNode(nodeId: String) async throws -> NodeActionResponse {
        return try await requestData("/admin/nodes/\(nodeId)/drain", method: .post, authenticated: true)
    }

    /// Enable a node (resume accepting tasks)
    func enableNode(nodeId: String) async throws -> NodeActionResponse {
        return try await requestData("/admin/nodes/\(nodeId)/enable", method: .post, authenticated: true)
    }

    /// Force a node offline
    func forceNodeOffline(nodeId: String) async throws -> NodeActionResponse {
        return try await requestData("/admin/nodes/\(nodeId)/force-offline", method: .post, authenticated: true)
    }

    // MARK: - Admin Task Actions

    /// Cancel a pending or running task
    func cancelTask(taskId: String) async throws -> TaskActionResponse {
        return try await requestData("/admin/tasks/\(taskId)/cancel", method: .post, authenticated: true)
    }

    /// Retry a failed or cancelled task
    func retryTask(taskId: String) async throws -> TaskActionResponse {
        return try await requestData("/admin/tasks/\(taskId)/retry", method: .post, authenticated: true)
    }

    // MARK: - Admin Overview

    /// Get system overview (uptime, queue depth, utilization)
    func getOverview() async throws -> AdminOverview {
        return try await requestData("/admin/overview", authenticated: true)
    }

    // MARK: - Authentication API

    /// Login with email and password
    func login(email: String, password: String) async throws -> AuthResponse {
        let requestBody = LoginRequest(email: email, password: password)
        return try await requestData("/auth/token", method: .post, body: requestBody, authenticated: false)
    }

    /// Refresh access token
    func refreshToken(refreshToken: String) async throws -> AuthResponse {
        let requestBody = RefreshTokenRequest(refreshToken: refreshToken)
        return try await requestData("/auth/refresh", method: .post, body: requestBody, authenticated: false)
    }

    /// Register device for push notifications
    func registerDevice(token: String) async throws {
        let requestBody = RegisterDeviceRequest(deviceToken: token, platform: "ios")
        let _: EmptyResponse = try await requestData("/devices/register", method: .post, body: requestBody, authenticated: true)
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
    let email: String
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

// MARK: - Task Dispatch Types

/// Request to dispatch a new task
struct TaskDispatchRequest: Codable {
    let taskId: String
    let requestId: String
    let command: String
    let timeoutMs: Int
    let priority: Int
}

/// Response from task dispatch
struct TaskDispatchResponse: Codable {
    let task: MCTask?
    let dispatched: Bool?
}

// MARK: - Admin Response Types

/// Response from node action endpoints (drain/enable/force-offline)
struct NodeActionResponse: Codable {
    let nodeId: String
    let status: String
    let message: String
}

/// Response from task action endpoints (cancel/retry)
struct TaskActionResponse: Codable {
    let taskId: String
    let previousStatus: String?
    let newStatus: String
    let message: String
}

/// Admin system overview
struct AdminOverview: Codable {
    let system: AdminSystem
    let nodes: AdminNodes
    let tasks: AdminTasks
    let errors: AdminErrors
    let timestamp: String

    struct AdminSystem: Codable {
        let uptime: Double
        let uptimeFormatted: String
        let version: String
        let nodeEnv: String
    }

    struct AdminNodes: Codable {
        let total: Int
        let online: Int
        let offline: Int
        let busy: Int
        let draining: Int
        let totalCapacity: Int?
        let usedCapacity: Int?
        let utilizationPercent: Double?
    }

    struct AdminTasks: Codable {
        let queueDepth: Int
    }

    struct AdminErrors: Codable {
        let recentCount: Int
    }
}
