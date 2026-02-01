import Foundation

/// Status of a compute node
enum NodeStatus: String, Codable, CaseIterable {
    case online
    case offline
    case busy
    case maintenance

    var displayName: String {
        switch self {
        case .online: return "Online"
        case .offline: return "Offline"
        case .busy: return "Busy"
        case .maintenance: return "Maintenance"
        }
    }

    var isAvailable: Bool {
        self == .online
    }
}

/// A compute node in the Mission Control system
struct Node: Identifiable, Codable, Equatable {
    let id: String
    let hostname: String
    let status: NodeStatus
    let load: Double?
    let capabilities: [String]
    let lastSeen: Date?
    let version: String?
    let platform: String?

    init(
        id: String = UUID().uuidString,
        hostname: String,
        status: NodeStatus = .offline,
        load: Double? = nil,
        capabilities: [String] = [],
        lastSeen: Date? = nil,
        version: String? = nil,
        platform: String? = nil
    ) {
        self.id = id
        self.hostname = hostname
        self.status = status
        self.load = load
        self.capabilities = capabilities
        self.lastSeen = lastSeen
        self.version = version
        self.platform = platform
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case hostname
        case status
        case load
        case capabilities
        case lastSeen
        case version
        case platform
    }
}

/// Response containing a list of nodes
struct NodeListResponse: Codable {
    let nodes: [Node]
}

/// System-wide status information
struct SystemStatus: Codable {
    let isHealthy: Bool
    let nodeCount: Int
    let activeTaskCount: Int
    let uptime: TimeInterval?

    init(
        isHealthy: Bool,
        nodeCount: Int,
        activeTaskCount: Int,
        uptime: TimeInterval? = nil
    ) {
        self.isHealthy = isHealthy
        self.nodeCount = nodeCount
        self.activeTaskCount = activeTaskCount
        self.uptime = uptime
    }
}
