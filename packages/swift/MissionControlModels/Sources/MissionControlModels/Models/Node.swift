import Foundation

public enum NodeStatus: String, Codable {
    case online
    case offline
    case busy
    case draining
}

public struct Node: Identifiable, Codable, Equatable {
    public let id: String
    public let hostname: String
    public let status: NodeStatus
    public let load: Double
    public let currentTasks: Int
    public let maxConcurrentTasks: Int
    public let capabilities: [String]
    public let lastHeartbeat: Date
    public var tailscaleIp: String?

    public init(id: String, hostname: String, status: NodeStatus, load: Double, currentTasks: Int, maxConcurrentTasks: Int, capabilities: [String], lastHeartbeat: Date, tailscaleIp: String? = nil) {
        self.id = id
        self.hostname = hostname
        self.status = status
        self.load = load
        self.currentTasks = currentTasks
        self.maxConcurrentTasks = maxConcurrentTasks
        self.capabilities = capabilities
        self.lastHeartbeat = lastHeartbeat
        self.tailscaleIp = tailscaleIp
    }
}
