import Foundation
import Observation
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
            return "Invalid email or password"
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
@Observable
final class AuthService {
    static let shared = AuthService()

    private(set) var state: AuthState = .unknown
    private(set) var isLoading = false
    var error: AuthError?

    private let keychain = KeychainService.shared
    private let apiClient = APIClient.shared
    private var refreshTask: Task<String, Error>?

    private init() {
        checkStoredToken()
    }

    // MARK: - Public API

    /// Check if user is currently authenticated
    var isAuthenticated: Bool {
        state == .authenticated
    }

    /// Get the current access token, refreshing if necessary
    func getValidToken() async throws -> String {
        if let refreshTask = refreshTask {
            return try await refreshTask.value
        }

        guard let token = try? keychain.getAccessToken() else {
            throw AuthError.noToken
        }

        if shouldRefreshToken() {
            return try await refreshToken()
        }

        return token
    }

    /// Log in with email and password
    func login(email: String, password: String) async throws {
        isLoading = true
        error = nil

        defer { isLoading = false }

        do {
            let response = try await apiClient.login(email: email, password: password)
            try saveTokens(response)
            apiClient.authToken = response.accessToken
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
        apiClient.authToken = nil
        state = .unauthenticated
        refreshTask?.cancel()
        refreshTask = nil
    }

    /// Refresh the access token
    func refreshToken() async throws -> String {
        if let refreshTask = refreshTask {
            return try await refreshTask.value
        }

        let task = Task<String, Error> {
            defer { self.refreshTask = nil }

            guard let refreshTokenValue = try? keychain.getRefreshToken() else {
                await MainActor.run { self.state = .unauthenticated }
                throw AuthError.noToken
            }

            let response = try await apiClient.refreshToken(refreshToken: refreshTokenValue)
            try saveTokens(response)
            apiClient.authToken = response.accessToken
            return response.accessToken
        }

        refreshTask = task
        return try await task.value
    }

    // MARK: - Private Methods

    private func checkStoredToken() {
        if keychain.hasAccessToken() {
            state = .authenticated
            // Restore token to APIClient on launch
            if let token = try? keychain.getAccessToken() {
                apiClient.authToken = token
            }
        } else {
            state = .unauthenticated
        }
    }

    private func shouldRefreshToken() -> Bool {
        // In a production app, decode the JWT and check the exp claim
        return false
    }

    private func saveTokens(_ response: AuthResponse) throws {
        try keychain.setAccessToken(response.accessToken)
        if let refreshToken = response.refreshToken {
            try keychain.setRefreshToken(refreshToken)
        }
    }
}
