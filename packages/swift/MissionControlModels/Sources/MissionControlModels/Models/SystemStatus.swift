import Foundation

public struct SystemStatus: Codable, Equatable {
    public let system: SystemInfo
    public let nodes: NodeStats
    public let tasks: TaskStats
    public let timestamp: Date

    public init(system: SystemInfo, nodes: NodeStats, tasks: TaskStats, timestamp: Date) {
        self.system = system
        self.nodes = nodes
        self.tasks = tasks
        self.timestamp = timestamp
    }
}

public struct SystemInfo: Codable, Equatable {
    public let uptime: TimeInterval
    public let uptimeFormatted: String
    public let version: String
    public let nodeEnv: String

    public init(uptime: TimeInterval, uptimeFormatted: String, version: String, nodeEnv: String) {
        self.uptime = uptime
        self.uptimeFormatted = uptimeFormatted
        self.version = version
        self.nodeEnv = nodeEnv
    }
}

public struct NodeStats: Codable, Equatable {
    public let total: Int
    public let online: Int
    public let offline: Int
    public let busy: Int
    public let draining: Int
    public let totalCapacity: Int
    public let usedCapacity: Int
    public let utilizationPercent: Int

    public init(total: Int, online: Int, offline: Int, busy: Int, draining: Int, totalCapacity: Int, usedCapacity: Int, utilizationPercent: Int) {
        self.total = total
        self.online = online
        self.offline = offline
        self.busy = busy
        self.draining = draining
        self.totalCapacity = totalCapacity
        self.usedCapacity = usedCapacity
        self.utilizationPercent = utilizationPercent
    }
}

public struct TaskStats: Codable, Equatable {
    public let queueDepth: Int

    public init(queueDepth: Int) {
        self.queueDepth = queueDepth
    }
}
