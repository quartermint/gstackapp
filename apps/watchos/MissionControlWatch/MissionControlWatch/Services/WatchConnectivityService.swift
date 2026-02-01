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
    var onStatusUpdate: ((SystemStatus) -> Void)?

    /// Callback for chat responses from iPhone
    var onChatResponse: ((String) -> Void)?

    // MARK: - Private Properties

    private var session: WCSession?
    private var pendingReplyHandlers: [String: (Result<String, Error>) -> Void] = [:]

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
    ///   - completion: Completion handler with the result
    func sendChatCommand(_ command: String, completion: @escaping (Result<String, Error>) -> Void) {
        guard let session = session, session.isReachable else {
            completion(.failure(WatchConnectivityError.notReachable))
            return
        }

        let messageId = UUID().uuidString
        let message: [String: Any] = [
            "type": "chatCommand",
            "command": command,
            "messageId": messageId,
            "timestamp": Date().timeIntervalSince1970
        ]

        // Store the completion handler
        pendingReplyHandlers[messageId] = completion

        session.sendMessage(message, replyHandler: { [weak self] reply in
            Task { @MainActor in
                self?.handleChatReply(reply, messageId: messageId)
            }
        }, errorHandler: { [weak self] error in
            Task { @MainActor in
                self?.pendingReplyHandlers.removeValue(forKey: messageId)
                completion(.failure(error))
            }
        })

        // Timeout after 30 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
            if let handler = self?.pendingReplyHandlers.removeValue(forKey: messageId) {
                handler(.failure(WatchConnectivityError.timeout))
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
        if let status = SystemStatus(from: reply) {
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
            if let status = SystemStatus(from: applicationContext) {
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
            if let status = SystemStatus(from: message) {
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
