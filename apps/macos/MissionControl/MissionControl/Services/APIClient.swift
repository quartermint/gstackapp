//
//  APIClient.swift
//  MissionControl
//
//  HTTP client for Hub API communication.
//  Extends BaseAPIClient from MissionControlNetworking with macOS-specific compute mode methods.
//

import Foundation
import MissionControlModels
import MissionControlNetworking

/// API client for Mission Control Hub
class APIClient: BaseAPIClient {

    /// Initialize with configuration from UserDefaults
    override init(configuration: APIConfiguration = .macOSDefault) {
        super.init(configuration: configuration)
    }

    /// Set the authentication token
    func setAuthToken(_ token: String?) {
        self.authToken = token
    }

    /// Update base URL (for settings changes)
    func setBaseURL(_ urlString: String) {
        // Note: BaseAPIClient configuration is immutable
        // This would require re-initializing the client
        // For now, this is a no-op - URL changes require app restart
    }

    // MARK: - Health

    struct HealthResponse: Codable {
        let status: String
        let version: String?
        let uptime: TimeInterval?
    }

    /// Check hub health
    func checkHealth() async throws -> HealthResponse {
        return try await request("/health", method: .get, authenticated: false)
    }

    // MARK: - Conversations

    /// List all conversations
    func listConversations() async throws -> [AppConversation] {
        struct ConversationsResponse: Codable {
            let conversations: [Conversation]
        }
        let response: ConversationsResponse = try await request("/conversations", method: .get)
        return response.conversations.map { AppConversation(from: $0) }
    }

    /// Get a single conversation
    func getConversation(id: String) async throws -> AppConversation {
        let conversation: Conversation = try await request("/conversations/\(id)", method: .get)
        return AppConversation(from: conversation)
    }

    /// Create a new conversation
    func createConversation(title: String) async throws -> AppConversation {
        struct CreateBody: Codable {
            let title: String
        }
        let conversation: Conversation = try await request(
            "/conversations",
            method: .post,
            body: CreateBody(title: title)
        )
        return AppConversation(from: conversation)
    }

    // MARK: - Messages

    struct ChatResponse: Codable {
        let content: String
        let conversationId: String?
    }

    /// Send a message and get response
    func sendMessage(conversationId: String, content: String) async throws -> ChatResponse {
        struct ChatBody: Codable {
            let conversationId: String
            let message: String
        }
        return try await request(
            "/chat",
            method: .post,
            body: ChatBody(conversationId: conversationId, message: content)
        )
    }

    // MARK: - Tasks

    /// List all tasks
    func listTasks(status: AppTaskStatus? = nil) async throws -> [AppTask] {
        struct TasksResponse: Codable {
            let tasks: [MCTask]
        }
        var endpoint = "/tasks"
        if let status = status {
            endpoint += "?status=\(status.rawValue)"
        }
        let response: TasksResponse = try await request(endpoint, method: .get)
        return response.tasks.map { AppTask(from: $0) }
    }

    /// Get a single task
    func getTask(id: String) async throws -> AppTask {
        let task: MCTask = try await request("/tasks/\(id)", method: .get)
        return AppTask(from: task)
    }

    /// Create a new task
    func createTask(type: String, payload: String) async throws -> AppTask {
        struct CreateTaskBody: Codable {
            let type: String
            let payload: String
        }
        let task: MCTask = try await request(
            "/tasks",
            method: .post,
            body: CreateTaskBody(type: type, payload: payload)
        )
        return AppTask(from: task)
    }

    /// Cancel a task
    func cancelTask(id: String) async throws {
        struct EmptyResponse: Codable {}
        let _: EmptyResponse = try await request("/tasks/\(id)/cancel", method: .post)
    }

    // MARK: - Nodes

    /// List all nodes
    func listNodes() async throws -> [AppNode] {
        struct NodesResponse: Codable {
            let nodes: [Node]
        }
        let response: NodesResponse = try await request("/api/nodes", method: .get)
        return response.nodes.map { AppNode(from: $0) }
    }

    /// Get a single node
    func getNode(id: String) async throws -> AppNode {
        let node: Node = try await request("/api/nodes/\(id)", method: .get)
        return AppNode(from: node)
    }

    // MARK: - Compute Mode APIs (macOS-specific)

    struct TaskClaimResponse: Codable {
        let task: MCTask?
        let claimed: Bool
    }

    /// Claim a pending task for execution (compute mode)
    func claimTask(nodeId: String) async throws -> TaskClaimResponse {
        struct ClaimBody: Codable {
            let nodeId: String
        }
        return try await request(
            "/api/compute/claim",
            method: .post,
            body: ClaimBody(nodeId: nodeId)
        )
    }

    struct TaskResultPayload: Codable {
        let taskId: String
        let nodeId: String
        let status: String
        let result: String?
        let error: String?
    }

    /// Submit task result (compute mode)
    func submitTaskResult(_ payload: TaskResultPayload) async throws {
        struct EmptyResponse: Codable {}
        let _: EmptyResponse = try await request(
            "/api/compute/result",
            method: .post,
            body: payload
        )
    }

    struct HeartbeatPayload: Codable {
        let nodeId: String
        let hostname: String
        let status: String
        let metrics: AppNodeMetrics?
    }

    /// Send heartbeat (compute mode)
    func sendHeartbeat(_ payload: HeartbeatPayload) async throws {
        struct EmptyResponse: Codable {}
        let _: EmptyResponse = try await request(
            "/api/compute/heartbeat",
            method: .post,
            body: payload
        )
    }
}

// MARK: - macOS Configuration Extension

extension APIConfiguration {
    /// macOS-specific default configuration
    static var macOSDefault: APIConfiguration {
        let urlString = UserDefaults.standard.string(forKey: "hubURL") ?? "http://localhost:3000"
        let timeout = UserDefaults.standard.double(forKey: "apiTimeout")

        return APIConfiguration(
            baseURL: URL(string: urlString)!,
            defaultHeaders: [
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "MissionControl-macOS/1.0"
            ],
            timeoutInterval: timeout > 0 ? timeout : 30.0
        )
    }
}
