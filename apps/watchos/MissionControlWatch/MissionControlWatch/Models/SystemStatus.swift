//
//  SystemStatus.swift
//  MissionControlWatch
//
//  Model representing the current system status from Mission Control Hub.
//

import Foundation

/// Represents the current status of the Mission Control system
struct SystemStatus: Codable, Equatable {
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
    let issues: [StatusIssue]?

    // MARK: - Initialization

    init(
        isHealthy: Bool,
        nodeCount: Int,
        activeTaskCount: Int,
        lastUpdated: Date? = nil,
        message: String? = nil,
        issues: [StatusIssue]? = nil
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
    static var disconnected: SystemStatus {
        SystemStatus(
            isHealthy: false,
            nodeCount: 0,
            activeTaskCount: 0,
            lastUpdated: nil,
            message: "Disconnected from iPhone",
            issues: nil
        )
    }

    /// Create a healthy status with given counts
    static func healthy(nodes: Int, tasks: Int) -> SystemStatus {
        SystemStatus(
            isHealthy: true,
            nodeCount: nodes,
            activeTaskCount: tasks,
            lastUpdated: Date(),
            message: nil,
            issues: nil
        )
    }

    /// Create an unhealthy status with issues
    static func unhealthy(nodes: Int, tasks: Int, issues: [StatusIssue]) -> SystemStatus {
        SystemStatus(
            isHealthy: false,
            nodeCount: nodes,
            activeTaskCount: tasks,
            lastUpdated: Date(),
            message: nil,
            issues: issues
        )
    }
}

// MARK: - StatusIssue

/// Represents a single issue or warning in the system
struct StatusIssue: Codable, Equatable, Identifiable {
    let id: String
    let severity: IssueSeverity
    let message: String
    let component: String?
    let timestamp: Date?

    init(
        id: String = UUID().uuidString,
        severity: IssueSeverity,
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
enum IssueSeverity: String, Codable {
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

extension SystemStatus {
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

extension SystemStatus {
    /// Sample data for previews and testing
    static var sampleHealthy: SystemStatus {
        SystemStatus(
            isHealthy: true,
            nodeCount: 3,
            activeTaskCount: 5,
            lastUpdated: Date(),
            message: nil,
            issues: nil
        )
    }

    static var sampleUnhealthy: SystemStatus {
        SystemStatus(
            isHealthy: false,
            nodeCount: 2,
            activeTaskCount: 1,
            lastUpdated: Date(),
            message: "One node offline",
            issues: [
                StatusIssue(
                    severity: .warning,
                    message: "mac-mini-1 is offline",
                    component: "compute"
                )
            ]
        )
    }
}
