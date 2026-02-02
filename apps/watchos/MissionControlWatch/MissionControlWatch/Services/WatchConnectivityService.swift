//
//  WatchConnectivityService.swift
//  MissionControlWatch
//
//  Handles communication between watchOS app and iOS companion app via WatchConnectivity.
//

import Foundation
import WatchConnectivity

/// Service for managing Watch-iPhone communication
@MainActor
class WatchConnectivityService: NSObject, ObservableObject {
    // MARK: - Published Properties

    /// Whether the iPhone is currently reachable
    @Published private(set) var isReachable: Bool = false

    /// Whether the WCSession is activated
    @Published private(set) var isActivated: Bool = false

    /// Last error encountered
    @Published private(set) var lastError: String?

    // MARK: - Callbacks

    /// Callback for status updates from iPhone
    var onStatusUpdate: ((WatchSystemStatus) -> Void)?

    /// Callback for chat responses from iPhone
    var onChatResponse: ((String) -> Void)?

    // MARK: - Private Properties

    private var session: WCSession?
    /// Pending reply handlers - accessed only on MainActor
    private var pendingReplyHandlers: [String: @Sendable (Result<String, Error>) -> Void] = [:]

    // MARK: - Initialization

    override init() {
        super.init()
    }

    // MARK: - Public Methods

    /// Activate the WatchConnectivity session
    func activate() {
        guard WCSession.isSupported() else {
            lastError = "WatchConnectivity not supported"
            return
        }

        session = WCSession.default
        session?.delegate = self
        session?.activate()
    }

    /// Request a status update from the iPhone app
    func requestStatusUpdate() {
        guard let session = session, session.isReachable else {
            lastError = "iPhone not reachable"
            return
        }

        let message: [String: Any] = [
            "type": "statusRequest",
            "timestamp": Date().timeIntervalSince1970
        ]

        session.sendMessage(message, replyHandler: { [weak self] reply in
            Task { @MainActor in
                self?.handleStatusReply(reply)
            }
        }, errorHandler: { [weak self] error in
            Task { @MainActor in
                self?.lastError = error.localizedDescription
            }
        })
    }

    /// Send a chat command to the iPhone app
    /// - Parameters:
    ///   - command: The command to send
    /// - Returns: The response string
    /// - Throws: WatchConnectivityError if the request fails
    func sendChatCommand(_ command: String) async throws -> String {
        guard let session = session, session.isReachable else {
            throw WatchConnectivityError.notReachable
        }

        let messageId = UUID().uuidString
        let message: [String: Any] = [
            "type": "chatCommand",
            "command": command,
            "messageId": messageId,
            "timestamp": Date().timeIntervalSince1970
        ]

        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
            // Store the handler - the pendingReplyHandlers dictionary ensures single-use
            // because removeValue returns nil on subsequent calls
            pendingReplyHandlers[messageId] = { result in
                continuation.resume(with: result)
            }

            session.sendMessage(message, replyHandler: { [weak self] reply in
                Task { @MainActor in
                    self?.handleChatReply(reply, messageId: messageId)
                }
            }, errorHandler: { [weak self] error in
                Task { @MainActor in
                    // Only resume if we successfully remove the handler (prevents double-resume)
                    if self?.pendingReplyHandlers.removeValue(forKey: messageId) != nil {
                        continuation.resume(throwing: error)
                    }
                }
            })

            // Timeout after 30 seconds
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(30))
                // Only resume if we successfully remove the handler (prevents double-resume)
                if self?.pendingReplyHandlers.removeValue(forKey: messageId) != nil {
                    continuation.resume(throwing: WatchConnectivityError.timeout)
                }
            }
        }
    }

    /// Send a quick action to the iPhone app (fire-and-forget)
    func sendQuickAction(_ action: String) {
        guard let session = session else { return }

        let userInfo: [String: Any] = [
            "type": "quickAction",
            "action": action,
            "timestamp": Date().timeIntervalSince1970
        ]

        // Use transferUserInfo for guaranteed delivery
        session.transferUserInfo(userInfo)
    }

    // MARK: - Private Methods

    private func handleStatusReply(_ reply: [String: Any]) {
        if let status = WatchSystemStatus(from: reply) {
            onStatusUpdate?(status)
        }
    }

    private func handleChatReply(_ reply: [String: Any], messageId: String) {
        guard let handler = pendingReplyHandlers.removeValue(forKey: messageId) else {
            return
        }

        if let response = reply["response"] as? String {
            handler(.success(response))
        } else if let error = reply["error"] as? String {
            handler(.failure(WatchConnectivityError.serverError(error)))
        } else {
            handler(.failure(WatchConnectivityError.invalidResponse))
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchConnectivityService: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        Task { @MainActor in
            self.isActivated = activationState == .activated
            if let error = error {
                self.lastError = error.localizedDescription
            }
            self.isReachable = session.isReachable
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            self.isReachable = session.isReachable
            if session.isReachable {
                self.lastError = nil
            }
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any]
    ) {
        Task { @MainActor in
            self.handleIncomingMessage(message)
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        Task { @MainActor in
            self.handleIncomingMessage(message)
            replyHandler(["received": true])
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        Task { @MainActor in
            // Handle background context updates
            if let status = WatchSystemStatus(from: applicationContext) {
                self.onStatusUpdate?(status)
            }
        }
    }

    // MARK: - Message Handling

    @MainActor
    private func handleIncomingMessage(_ message: [String: Any]) {
        guard let type = message["type"] as? String else { return }

        switch type {
        case "statusUpdate":
            if let status = WatchSystemStatus(from: message) {
                onStatusUpdate?(status)
            }

        case "chatResponse":
            if let response = message["response"] as? String {
                onChatResponse?(response)
            }

        default:
            break
        }
    }
}

// MARK: - Errors

enum WatchConnectivityError: LocalizedError {
    case notReachable
    case timeout
    case invalidResponse
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .notReachable:
            return "iPhone not reachable"
        case .timeout:
            return "Request timed out"
        case .invalidResponse:
            return "Invalid response from iPhone"
        case .serverError(let message):
            return message
        }
    }
}
