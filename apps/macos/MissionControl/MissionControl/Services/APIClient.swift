//
//  APIClient.swift
//  MissionControl
//
//  HTTP client for Hub API communication.
//

import Foundation

/// API client for Mission Control Hub
class APIClient {
    private var baseURL: URL
    private var authToken: String?
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init() {
        // Load from UserDefaults or use default
        let urlString = UserDefaults.standard.string(forKey: "hubURL") ?? "https://hub.mission-control.local"
        self.baseURL = URL(string: urlString)!

        // Configure URL session
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = UserDefaults.standard.double(forKey: "apiTimeout") > 0
            ? UserDefaults.standard.double(forKey: "apiTimeout")
            : 30.0
        config.timeoutIntervalForResource = 60.0
        self.session = URLSession(configuration: config)

        // Configure JSON coding
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    /// Set the authentication token
    func setAuthToken(_ token: String?) {
        self.authToken = token
    }

    /// Update base URL
    func setBaseURL(_ urlString: String) {
        if let url = URL(string: urlString) {
            self.baseURL = url
        }
    }

    // MARK: - Health

    struct HealthResponse: Codable {
        let status: String
        let version: String?
        let uptime: TimeInterval?
    }

    /// Check hub health
    func checkHealth() async throws -> HealthResponse {
        let request = try buildRequest(path: "/health", method: "GET")
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return try decoder.decode(HealthResponse.self, from: data)
    }

    // MARK: - Conversations

    /// List all conversations
    func listConversations() async throws -> [Conversation] {
        let request = try buildRequest(path: "/api/conversations", method: "GET")
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        let apiResponse = try decoder.decode(ConversationsResponse.self, from: data)
        return apiResponse.conversations
    }

    struct ConversationsResponse: Codable {
        let conversations: [Conversation]
    }

    /// Get a single conversation
    func getConversation(id: String) async throws -> Conversation {
        let request = try buildRequest(path: "/api/conversations/\(id)", method: "GET")
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return try decoder.decode(Conversation.self, from: data)
    }

    /// Create a new conversation
    func createConversation(title: String) async throws -> Conversation {
        var request = try buildRequest(path: "/api/conversations", method: "POST")

        let body = ["title": title]
        request.httpBody = try encoder.encode(body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return try decoder.decode(Conversation.self, from: data)
    }

    // MARK: - Messages

    struct ChatResponse: Codable {
        let content: String
        let conversationId: String?
    }

    /// Send a message and get response
    func sendMessage(conversationId: String, content: String) async throws -> ChatResponse {
        var request = try buildRequest(path: "/api/chat", method: "POST")

        let body: [String: Any] = [
            "conversationId": conversationId,
            "message": content
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return try decoder.decode(ChatResponse.self, from: data)
    }

    // MARK: - Tasks

    /// List all tasks
    func listTasks(status: TaskStatus? = nil) async throws -> [TaskItem] {
        var path = "/api/tasks"
        if let status = status {
            path += "?status=\(status.rawValue)"
        }

        let request = try buildRequest(path: path, method: "GET")
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        let apiResponse = try decoder.decode(TasksResponse.self, from: data)
        return apiResponse.tasks
    }

    struct TasksResponse: Codable {
        let tasks: [TaskItem]
    }

    /// Get a single task
    func getTask(id: String) async throws -> TaskItem {
        let request = try buildRequest(path: "/api/tasks/\(id)", method: "GET")
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return try decoder.decode(TaskItem.self, from: data)
    }

    /// Create a new task
    func createTask(type: String, payload: String) async throws -> TaskItem {
        var request = try buildRequest(path: "/api/tasks", method: "POST")

        let body: [String: Any] = [
            "type": type,
            "payload": payload
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return try decoder.decode(TaskItem.self, from: data)
    }

    /// Cancel a task
    func cancelTask(id: String) async throws {
        let request = try buildRequest(path: "/api/tasks/\(id)/cancel", method: "POST")
        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }

    // MARK: - Nodes

    /// List all nodes
    func listNodes() async throws -> [NodeInfo] {
        let request = try buildRequest(path: "/api/nodes", method: "GET")
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        let apiResponse = try decoder.decode(NodesResponse.self, from: data)
        return apiResponse.nodes
    }

    struct NodesResponse: Codable {
        let nodes: [NodeInfo]
    }

    /// Get a single node
    func getNode(id: String) async throws -> NodeInfo {
        let request = try buildRequest(path: "/api/nodes/\(id)", method: "GET")
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return try decoder.decode(NodeInfo.self, from: data)
    }

    // MARK: - Compute Mode APIs

    struct TaskClaimResponse: Codable {
        let task: TaskItem?
        let claimed: Bool
    }

    /// Claim a pending task for execution (compute mode)
    func claimTask(nodeId: String) async throws -> TaskClaimResponse {
        var request = try buildRequest(path: "/api/compute/claim", method: "POST")

        let body = ["nodeId": nodeId]
        request.httpBody = try encoder.encode(body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        return try decoder.decode(TaskClaimResponse.self, from: data)
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
        var request = try buildRequest(path: "/api/compute/result", method: "POST")
        request.httpBody = try encoder.encode(payload)

        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }

    struct HeartbeatPayload: Codable {
        let nodeId: String
        let hostname: String
        let status: String
        let metrics: NodeMetrics?
    }

    /// Send heartbeat (compute mode)
    func sendHeartbeat(_ payload: HeartbeatPayload) async throws {
        var request = try buildRequest(path: "/api/compute/heartbeat", method: "POST")
        request.httpBody = try encoder.encode(payload)

        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }

    // MARK: - Helpers

    private func buildRequest(path: String, method: String) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("MissionControl-macOS/1.0", forHTTPHeaderField: "User-Agent")

        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        return request
    }

    private func validateResponse(_ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200...299:
            return
        case 401:
            throw APIError.unauthorized
        case 403:
            throw APIError.forbidden
        case 404:
            throw APIError.notFound
        case 429:
            throw APIError.rateLimited
        case 500...599:
            throw APIError.serverError(httpResponse.statusCode)
        default:
            throw APIError.httpError(httpResponse.statusCode)
        }
    }
}

/// API errors
enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case forbidden
    case notFound
    case rateLimited
    case serverError(Int)
    case httpError(Int)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .unauthorized:
            return "Authentication required"
        case .forbidden:
            return "Access denied"
        case .notFound:
            return "Resource not found"
        case .rateLimited:
            return "Rate limit exceeded. Please try again later."
        case .serverError(let code):
            return "Server error (\(code))"
        case .httpError(let code):
            return "HTTP error (\(code))"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        }
    }
}
