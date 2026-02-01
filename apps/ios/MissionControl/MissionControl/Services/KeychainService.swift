import Foundation
import Security

/// Errors that can occur during Keychain operations
enum KeychainError: Error, LocalizedError {
    case itemNotFound
    case duplicateItem
    case unexpectedStatus(OSStatus)
    case invalidData
    case encodingFailed

    var errorDescription: String? {
        switch self {
        case .itemNotFound:
            return "Item not found in Keychain"
        case .duplicateItem:
            return "Item already exists in Keychain"
        case .unexpectedStatus(let status):
            return "Keychain error: \(status)"
        case .invalidData:
            return "Invalid data retrieved from Keychain"
        case .encodingFailed:
            return "Failed to encode data for Keychain"
        }
    }
}

/// Service for securely storing credentials in the iOS Keychain
final class KeychainService {
    static let shared = KeychainService()

    private let serviceName = "com.missioncontrol.ios"

    private init() {}

    // MARK: - Token Storage

    private let accessTokenKey = "accessToken"
    private let refreshTokenKey = "refreshToken"

    /// Store the access token securely
    func setAccessToken(_ token: String) throws {
        try set(token, forKey: accessTokenKey)
    }

    /// Retrieve the stored access token
    func getAccessToken() throws -> String {
        try get(forKey: accessTokenKey)
    }

    /// Delete the stored access token
    func deleteAccessToken() throws {
        try delete(forKey: accessTokenKey)
    }

    /// Store the refresh token securely
    func setRefreshToken(_ token: String) throws {
        try set(token, forKey: refreshTokenKey)
    }

    /// Retrieve the stored refresh token
    func getRefreshToken() throws -> String {
        try get(forKey: refreshTokenKey)
    }

    /// Delete the stored refresh token
    func deleteRefreshToken() throws {
        try delete(forKey: refreshTokenKey)
    }

    /// Clear all stored tokens
    func clearAllTokens() {
        try? deleteAccessToken()
        try? deleteRefreshToken()
    }

    // MARK: - Generic Keychain Operations

    /// Store a string value in the Keychain
    func set(_ value: String, forKey key: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]

        // Delete any existing item first
        SecItemDelete(query as CFDictionary)

        let status = SecItemAdd(query as CFDictionary, nil)

        guard status == errSecSuccess else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    /// Retrieve a string value from the Keychain
    func get(forKey key: String) throws -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else {
            if status == errSecItemNotFound {
                throw KeychainError.itemNotFound
            }
            throw KeychainError.unexpectedStatus(status)
        }

        guard let data = result as? Data,
              let string = String(data: data, encoding: .utf8) else {
            throw KeychainError.invalidData
        }

        return string
    }

    /// Delete a value from the Keychain
    func delete(forKey key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key
        ]

        let status = SecItemDelete(query as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    /// Check if a key exists in the Keychain
    func exists(forKey key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: false
        ]

        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess
    }
}
