//
//  WatchSystemStatus.swift
//  MissionControlWatch
//
//  Simplified status model optimized for watchOS and WatchConnectivity.
//  This is a watch-specific model separate from the shared MissionControlModels.SystemStatus.
//

import Foundation
import MissionControlModels

/// Represents the current status of the Mission Control system (watchOS-optimized)
struct WatchSystemStatus: Codable, Equatable {
    /// Whether all systems are operating normally
    let isHealthy: Bool

    /// Number of compute nodes currently online
    let nodeCount: Int

    /// Number of tasks currently being processed
    let activeTaskCount: Int

    /// When this status was last updated
    let lastUpdated: Date?

    /// Optional status message from the Hub
    let message: String?

    /// List of any current issues or warnings
    let issues: [WatchStatusIssue]?

    // MARK: - Initialization

    init(
        isHealthy: Bool,
        nodeCount: Int,
        activeTaskCount: Int,
        lastUpdated: Date? = nil,
        message: String? = nil,
        issues: [WatchStatusIssue]? = nil
    ) {
        self.isHealthy = isHealthy
        self.nodeCount = nodeCount
        self.activeTaskCount = activeTaskCount
        self.lastUpdated = lastUpdated
        self.message = message
        self.issues = issues
    }

    // MARK: - Static Factory Methods

    /// Default disconnected state
    static var disconnected: WatchSystemStatus {
        WatchSystemStatus(
            isHealthy: false,
            nodeCount: 0,
            activeTaskCount: 0,
            lastUpdated: nil,
            message: "Disconnected from iPhone",
            issues: nil
        )
    }

    /// Create a healthy status with given counts
    static func healthy(nodes: Int, tasks: Int) -> WatchSystemStatus {
        WatchSystemStatus(
            isHealthy: true,
            nodeCount: nodes,
            activeTaskCount: tasks,
            lastUpdated: Date(),
            message: nil,
            issues: nil
        )
    }

    /// Create an unhealthy status with issues
    static func unhealthy(nodes: Int, tasks: Int, issues: [WatchStatusIssue]) -> WatchSystemStatus {
        WatchSystemStatus(
            isHealthy: false,
            nodeCount: nodes,
            activeTaskCount: tasks,
            lastUpdated: Date(),
            message: nil,
            issues: issues
        )
    }
}

// MARK: - Conversion from Shared Model

extension WatchSystemStatus {
    /// Initialize from the shared MissionControlModels.SystemStatus
    init(from sharedStatus: MissionControlModels.SystemStatus) {
        let nodes = sharedStatus.nodes
        self.isHealthy = nodes.offline == 0 && nodes.online > 0
        self.nodeCount = nodes.online
        self.activeTaskCount = sharedStatus.tasks.queueDepth
        self.lastUpdated = sharedStatus.timestamp
        self.message = nil
        self.issues = nodes.offline > 0 ? [
            WatchStatusIssue(
                severity: .warning,
                message: "\(nodes.offline) node(s) offline",
                component: "compute"
            )
        ] : nil
    }
}

// MARK: - WatchStatusIssue

/// Represents a single issue or warning in the system
struct WatchStatusIssue: Codable, Equatable, Identifiable {
    let id: String
    let severity: WatchIssueSeverity
    let message: String
    let component: String?
    let timestamp: Date?

    init(
        id: String = UUID().uuidString,
        severity: WatchIssueSeverity,
        message: String,
        component: String? = nil,
        timestamp: Date? = nil
    ) {
        self.id = id
        self.severity = severity
        self.message = message
        self.component = component
        self.timestamp = timestamp
    }
}

/// Severity levels for system issues
enum WatchIssueSeverity: String, Codable {
    case warning
    case error
    case critical

    var displayName: String {
        switch self {
        case .warning: return "Warning"
        case .error: return "Error"
        case .critical: return "Critical"
        }
    }
}

// MARK: - Dictionary Conversion

extension WatchSystemStatus {
    /// Initialize from dictionary (for WatchConnectivity messages)
    init?(from dictionary: [String: Any]) {
        guard let isHealthy = dictionary["isHealthy"] as? Bool,
              let nodeCount = dictionary["nodeCount"] as? Int,
              let activeTaskCount = dictionary["activeTaskCount"] as? Int else {
            return nil
        }

        self.isHealthy = isHealthy
        self.nodeCount = nodeCount
        self.activeTaskCount = activeTaskCount

        if let timestamp = dictionary["lastUpdated"] as? TimeInterval {
            self.lastUpdated = Date(timeIntervalSince1970: timestamp)
        } else {
            self.lastUpdated = Date()
        }

        self.message = dictionary["message"] as? String
        self.issues = nil // Simplified for watch
    }

    /// Convert to dictionary for WatchConnectivity
    func toDictionary() -> [String: Any] {
        var dict: [String: Any] = [
            "isHealthy": isHealthy,
            "nodeCount": nodeCount,
            "activeTaskCount": activeTaskCount
        ]

        if let lastUpdated = lastUpdated {
            dict["lastUpdated"] = lastUpdated.timeIntervalSince1970
        }

        if let message = message {
            dict["message"] = message
        }

        return dict
    }
}

// MARK: - Sample Data

extension WatchSystemStatus {
    /// Sample data for previews and testing
    static var sampleHealthy: WatchSystemStatus {
        WatchSystemStatus(
            isHealthy: true,
            nodeCount: 3,
            activeTaskCount: 5,
            lastUpdated: Date(),
            message: nil,
            issues: nil
        )
    }

    static var sampleUnhealthy: WatchSystemStatus {
        WatchSystemStatus(
            isHealthy: false,
            nodeCount: 2,
            activeTaskCount: 1,
            lastUpdated: Date(),
            message: "One node offline",
            issues: [
                WatchStatusIssue(
                    severity: .warning,
                    message: "mac-mini-1 is offline",
                    component: "compute"
                )
            ]
        )
    }
}
