//
//  KeychainService.swift
//  MissionControl
//
//  Secure token storage using macOS Keychain.
//  Extends BaseKeychainService from MissionControlNetworking with macOS-specific convenience methods.
//

import Foundation
import Security
import MissionControlNetworking

/// Service for secure credential storage in macOS Keychain
class KeychainService: BaseKeychainService {

    /// Keychain key constants
    private enum Key {
        static let authToken = "auth_token"
        static let refreshToken = "refresh_token"
        static let nodeId = "node_id"
    }

    /// Initialize with macOS-specific service name
    init() {
        super.init(serviceName: "com.mission-control.macos")
    }

    // MARK: - Auth Token

    /// Save authentication token
    func saveAuthToken(_ token: String) {
        do {
            try saveString(token, for: Key.authToken)
        } catch {
            print("Failed to save auth token: \(error)")
        }
    }

    /// Get authentication token
    func getAuthToken() -> String? {
        do {
            return try loadString(for: Key.authToken)
        } catch KeychainError.itemNotFound {
            return nil
        } catch {
            print("Failed to get auth token: \(error)")
            return nil
        }
    }

    /// Delete authentication token
    func deleteAuthToken() {
        do {
            try delete(for: Key.authToken)
        } catch {
            print("Failed to delete auth token: \(error)")
        }
    }

    /// Check if auth token exists
    func hasAuthToken() -> Bool {
        return exists(for: Key.authToken)
    }

    // MARK: - Refresh Token

    /// Save refresh token
    func saveRefreshToken(_ token: String) {
        do {
            try saveString(token, for: Key.refreshToken)
        } catch {
            print("Failed to save refresh token: \(error)")
        }
    }

    /// Get refresh token
    func getRefreshToken() -> String? {
        do {
            return try loadString(for: Key.refreshToken)
        } catch KeychainError.itemNotFound {
            return nil
        } catch {
            print("Failed to get refresh token: \(error)")
            return nil
        }
    }

    /// Delete refresh token
    func deleteRefreshToken() {
        do {
            try delete(for: Key.refreshToken)
        } catch {
            print("Failed to delete refresh token: \(error)")
        }
    }

    // MARK: - Node ID

    /// Save node ID for compute mode
    func saveNodeId(_ nodeId: String) {
        do {
            try saveString(nodeId, for: Key.nodeId)
        } catch {
            print("Failed to save node ID: \(error)")
        }
    }

    /// Get node ID
    func getNodeId() -> String? {
        do {
            return try loadString(for: Key.nodeId)
        } catch KeychainError.itemNotFound {
            return nil
        } catch {
            print("Failed to get node ID: \(error)")
            return nil
        }
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
        deleteAuthToken()
        deleteRefreshToken()
        do {
            try delete(for: Key.nodeId)
        } catch {
            // Ignore errors when clearing
        }
    }

    // MARK: - Status

    /// Check Keychain accessibility
    func isKeychainAccessible() -> Bool {
        let testKey = "keychain_test_\(UUID().uuidString)"
        let testValue = "test"

        do {
            try saveString(testValue, for: testKey)
            try delete(for: testKey)
            return true
        } catch {
            return false
        }
    }
}
