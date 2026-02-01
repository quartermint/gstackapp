import Foundation
import Combine

/// Errors that can occur during API requests
enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int, message: String?)
    case decodingError(Error)
    case networkError(Error)
    case unauthorized
    case serverUnavailable

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let statusCode, let message):
            return "HTTP error \(statusCode): \(message ?? "Unknown error")"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .unauthorized:
            return "Authentication required"
        case .serverUnavailable:
            return "Server is unavailable"
        }
    }
}

/// HTTP methods supported by the API client
enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

/// Client for communicating with the Mission Control Hub API
@MainActor
final class APIClient: ObservableObject {
    static let shared = APIClient()

    @Published var isConnected = false
    @Published var baseURL: URL

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(baseURL: URL? = nil) {
        // Default to Tailscale IP - should be configured in Settings
        self.baseURL = baseURL ?? URL(string: "http://100.64.0.1:3000")!

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            // Try ISO8601 with fractional seconds first
            let isoFormatter = ISO8601DateFormatter()
            isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = isoFormatter.date(from: dateString) {
                return date
            }

            // Try without fractional seconds
            isoFormatter.formatOptions = [.withInternetDateTime]
            if let date = isoFormatter.date(from: dateString) {
                return date
            }

            // Try Unix timestamp
            if let timestamp = Double(dateString) {
                return Date(timeIntervalSince1970: timestamp)
            }

            throw DecodingError.dataCorrupted(
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Unable to decode date: \(dateString)"
                )
            )
        }

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Configuration

    /// Update the base URL for the Hub
    func setBaseURL(_ url: URL) {
        self.baseURL = url
    }

    // MARK: - Chat API

    /// Send a chat message
    func chat(message: String, conversationId: String? = nil) async throws -> ChatResponse {
        let request = ChatRequest(message: message, conversationId: conversationId)
        return try await post("/chat", body: request)
    }

    // MARK: - Conversations API

    /// Get all conversations
    func getConversations() async throws -> [Conversation] {
        let response: ConversationListResponse = try await get("/conversations")
        return response.conversations
    }

    /// Get messages for a conversation
    func getConversationMessages(conversationId: String) async throws -> [Message] {
        let response: ConversationMessagesResponse = try await get("/conversations/\(conversationId)/messages")
        return response.messages
    }

    // MARK: - Nodes API

    /// Get all nodes
    func getNodes() async throws -> [Node] {
        let response: NodeListResponse = try await get("/admin/nodes")
        return response.nodes
    }

    /// Get system health status
    func getHealth() async throws -> SystemStatus {
        return try await get("/health")
    }

    // MARK: - Tasks API

    /// Get all tasks
    func getTasks(status: TaskStatus? = nil) async throws -> [MCTask] {
        var path = "/tasks"
        if let status = status {
            path += "?status=\(status.rawValue)"
        }
        let response: TaskListResponse = try await get(path)
        return response.tasks
    }

    /// Get a specific task
    func getTask(id: String) async throws -> MCTask {
        return try await get("/tasks/\(id)")
    }

    // MARK: - Authentication API

    /// Login with username and password
    func login(username: String, password: String) async throws -> AuthResponse {
        let request = LoginRequest(username: username, password: password)
        return try await post("/auth/token", body: request, authenticated: false)
    }

    /// Refresh access token
    func refreshToken(refreshToken: String) async throws -> AuthResponse {
        struct RefreshRequest: Codable {
            let refreshToken: String
        }
        return try await post("/auth/refresh", body: RefreshRequest(refreshToken: refreshToken), authenticated: false)
    }

    /// Register device for push notifications
    func registerDevice(token: String) async throws {
        struct RegisterRequest: Codable {
            let deviceToken: String
            let platform: String
        }
        let _: EmptyResponse = try await post(
            "/devices/register",
            body: RegisterRequest(deviceToken: token, platform: "ios")
        )
    }

    // MARK: - Connection Check

    /// Check if the Hub is reachable
    func checkConnection() async {
        do {
            let _: SystemStatus = try await get("/health")
            isConnected = true
        } catch {
            isConnected = false
        }
    }

    // MARK: - Generic Request Methods

    private func get<T: Decodable>(_ path: String, authenticated: Bool = true) async throws -> T {
        return try await request(path, method: .get, authenticated: authenticated)
    }

    private func post<T: Decodable, B: Encodable>(
        _ path: String,
        body: B,
        authenticated: Bool = true
    ) async throws -> T {
        return try await request(path, method: .post, body: body, authenticated: authenticated)
    }

    private func request<T: Decodable, B: Encodable>(
        _ path: String,
        method: HTTPMethod,
        body: B? = nil as EmptyBody?,
        authenticated: Bool = true
    ) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        // Add auth token if required
        if authenticated {
            if let token = try? await AuthService.shared.getValidToken() {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
        }

        // Encode body if present
        if let body = body, !(body is EmptyBody) {
            request.httpBody = try encoder.encode(body)
        }

        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse
            }

            switch httpResponse.statusCode {
            case 200...299:
                do {
                    return try decoder.decode(T.self, from: data)
                } catch {
                    throw APIError.decodingError(error)
                }

            case 401:
                throw APIError.unauthorized

            case 503:
                throw APIError.serverUnavailable

            default:
                let message = String(data: data, encoding: .utf8)
                throw APIError.httpError(statusCode: httpResponse.statusCode, message: message)
            }
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.networkError(error)
        }
    }
}

// MARK: - Helper Types

private struct EmptyBody: Encodable {}

private struct EmptyResponse: Decodable {}
