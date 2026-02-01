import Foundation
import Security
import MissionControlNetworking

/// iOS-specific Keychain service that extends the shared BaseKeychainService
/// Provides token-specific convenience methods for iOS authentication
final class KeychainService: BaseKeychainService {
    static let shared = KeychainService()

    // MARK: - Keys
    private let accessTokenKey = "accessToken"
    private let refreshTokenKey = "refreshToken"

    private init() {
        super.init(serviceName: "com.missioncontrol.ios")
    }

    // MARK: - Token Storage

    /// Store the access token securely
    func setAccessToken(_ token: String) throws {
        try saveString(token, for: accessTokenKey)
    }

    /// Retrieve the stored access token
    func getAccessToken() throws -> String {
        try loadString(for: accessTokenKey)
    }

    /// Delete the stored access token
    func deleteAccessToken() throws {
        try delete(for: accessTokenKey)
    }

    /// Store the refresh token securely
    func setRefreshToken(_ token: String) throws {
        try saveString(token, for: refreshTokenKey)
    }

    /// Retrieve the stored refresh token
    func getRefreshToken() throws -> String {
        try loadString(for: refreshTokenKey)
    }

    /// Delete the stored refresh token
    func deleteRefreshToken() throws {
        try delete(for: refreshTokenKey)
    }

    /// Clear all stored tokens
    func clearAllTokens() {
        try? deleteAccessToken()
        try? deleteRefreshToken()
    }

    /// Check if access token exists
    func hasAccessToken() -> Bool {
        exists(for: accessTokenKey)
    }

    /// Check if refresh token exists
    func hasRefreshToken() -> Bool {
        exists(for: refreshTokenKey)
    }
}
