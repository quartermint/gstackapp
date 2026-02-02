import Foundation
import Combine
import MissionControlNetworking

/// Authentication state for the app
enum AuthState: Equatable {
    case unknown
    case authenticated
    case unauthenticated
}

/// Errors related to authentication
enum AuthError: Error, LocalizedError {
    case invalidCredentials
    case tokenExpired
    case networkError(Error)
    case serverError(String)
    case noToken

    var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return "Invalid username or password"
        case .tokenExpired:
            return "Session expired. Please log in again."
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let message):
            return "Server error: \(message)"
        case .noToken:
            return "No authentication token available"
        }
    }
}

/// Service for managing authentication state and tokens
@MainActor
final class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published private(set) var state: AuthState = .unknown
    @Published private(set) var isLoading = false
    @Published var error: AuthError?

    private let keychain = KeychainService.shared
    private let apiClient: APIClient
    private var refreshTask: Task<String, Error>?

    private init() {
        self.apiClient = APIClient.shared
        checkStoredToken()
    }

    // MARK: - Public API

    /// Check if user is currently authenticated
    var isAuthenticated: Bool {
        state == .authenticated
    }

    /// Get the current access token, refreshing if necessary
    func getValidToken() async throws -> String {
        // If there's already a refresh in progress, wait for it
        if let refreshTask = refreshTask {
            return try await refreshTask.value
        }

        guard let token = try? keychain.getAccessToken() else {
            throw AuthError.noToken
        }

        // Check if token needs refresh (basic check - in production, decode JWT and check exp)
        if shouldRefreshToken() {
            return try await refreshToken()
        }

        return token
    }

    /// Log in with username and password
    func login(username: String, password: String) async throws {
        isLoading = true
        error = nil

        defer { isLoading = false }

        do {
            let response = try await performLogin(username: username, password: password)
            try saveTokens(response)
            state = .authenticated
        } catch let authError as AuthError {
            error = authError
            throw authError
        } catch {
            let authError = AuthError.networkError(error)
            self.error = authError
            throw authError
        }
    }

    /// Log out and clear stored tokens
    func logout() {
        keychain.clearAllTokens()
        state = .unauthenticated
        refreshTask?.cancel()
        refreshTask = nil
    }

    /// Refresh the access token
    func refreshToken() async throws -> String {
        // Prevent multiple simultaneous refresh requests
        if let refreshTask = refreshTask {
            return try await refreshTask.value
        }

        let task = Task<String, Error> {
            defer { self.refreshTask = nil }

            guard let refreshToken = try? keychain.getRefreshToken() else {
                await MainActor.run { self.state = .unauthenticated }
                throw AuthError.noToken
            }

            let response = try await performRefresh(refreshToken: refreshToken)
            try saveTokens(response)
            return response.accessToken
        }

        refreshTask = task
        return try await task.value
    }

    // MARK: - Private Methods

    private func checkStoredToken() {
        if keychain.hasAccessToken() {
            // Set the token on the API client for authenticated requests
            if let token = try? keychain.getAccessToken() {
                apiClient.authToken = token
            }
            state = .authenticated
        } else {
            state = .unauthenticated
        }
    }

    private func shouldRefreshToken() -> Bool {
        // In a production app, decode the JWT and check the exp claim
        // For now, always assume token is valid if it exists
        return false
    }

    private func saveTokens(_ response: AuthResponse) throws {
        try keychain.setAccessToken(response.accessToken)
        if let refreshToken = response.refreshToken {
            try keychain.setRefreshToken(refreshToken)
        }
    }

    private func performLogin(username: String, password: String) async throws -> AuthResponse {
        do {
            let response = try await apiClient.login(username: username, password: password)
            // Set the token on the API client for subsequent authenticated requests
            apiClient.authToken = response.accessToken
            return response
        } catch let error as APIError {
            switch error {
            case .unauthorized:
                throw AuthError.invalidCredentials
            case .networkError(let underlying):
                throw AuthError.networkError(underlying)
            default:
                throw AuthError.serverError(error.localizedDescription)
            }
        }
    }

    private func performRefresh(refreshToken: String) async throws -> AuthResponse {
        do {
            let response = try await apiClient.refreshToken(refreshToken: refreshToken)
            // Update the token on the API client
            apiClient.authToken = response.accessToken
            return response
        } catch let error as APIError {
            switch error {
            case .unauthorized:
                throw AuthError.tokenExpired
            case .networkError(let underlying):
                throw AuthError.networkError(underlying)
            default:
                throw AuthError.serverError(error.localizedDescription)
            }
        }
    }
}
