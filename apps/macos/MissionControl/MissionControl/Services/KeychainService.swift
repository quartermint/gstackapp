//
//  KeychainService.swift
//  MissionControl
//
//  Secure token storage using macOS Keychain.
//

import Foundation
import Security

/// Service for secure credential storage in macOS Keychain
class KeychainService {
    private let serviceName = "com.mission-control.macos"

    enum KeychainKey: String {
        case authToken = "auth_token"
        case refreshToken = "refresh_token"
        case nodeId = "node_id"
    }

    // MARK: - Auth Token

    /// Save authentication token
    func saveAuthToken(_ token: String) {
        save(key: .authToken, value: token)
    }

    /// Get authentication token
    func getAuthToken() -> String? {
        return get(key: .authToken)
    }

    /// Delete authentication token
    func deleteAuthToken() {
        delete(key: .authToken)
    }

    /// Check if auth token exists
    func hasAuthToken() -> Bool {
        return getAuthToken() != nil
    }

    // MARK: - Refresh Token

    /// Save refresh token
    func saveRefreshToken(_ token: String) {
        save(key: .refreshToken, value: token)
    }

    /// Get refresh token
    func getRefreshToken() -> String? {
        return get(key: .refreshToken)
    }

    /// Delete refresh token
    func deleteRefreshToken() {
        delete(key: .refreshToken)
    }

    // MARK: - Node ID

    /// Save node ID for compute mode
    func saveNodeId(_ nodeId: String) {
        save(key: .nodeId, value: nodeId)
    }

    /// Get node ID
    func getNodeId() -> String? {
        return get(key: .nodeId)
    }

    /// Get or create node ID
    func getOrCreateNodeId() -> String {
        if let existingId = getNodeId() {
            return existingId
        }
        let newId = UUID().uuidString
        saveNodeId(newId)
        return newId
    }

    // MARK: - Clear All

    /// Clear all stored credentials
    func clearAll() {
        for key in [KeychainKey.authToken, .refreshToken, .nodeId] {
            delete(key: key)
        }
    }

    // MARK: - Private Methods

    private func save(key: KeychainKey, value: String) {
        guard let data = value.data(using: .utf8) else { return }

        // Delete existing item first
        delete(key: key)

        // Create query for new item
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key.rawValue,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            print("Keychain save error for \(key.rawValue): \(status)")
        }
    }

    private func get(key: KeychainKey) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key.rawValue,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecSuccess, let data = result as? Data {
            return String(data: data, encoding: .utf8)
        }

        return nil
    }

    private func delete(key: KeychainKey) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key.rawValue
        ]

        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            print("Keychain delete error for \(key.rawValue): \(status)")
        }
    }

    // MARK: - Status

    /// Check Keychain accessibility
    func isKeychainAccessible() -> Bool {
        let testKey = "keychain_test_\(UUID().uuidString)"
        let testValue = "test"

        // Try to save
        let saveQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: testKey,
            kSecValueData as String: testValue.data(using: .utf8)!
        ]

        let saveStatus = SecItemAdd(saveQuery as CFDictionary, nil)

        // Clean up
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: testKey
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        return saveStatus == errSecSuccess
    }
}
