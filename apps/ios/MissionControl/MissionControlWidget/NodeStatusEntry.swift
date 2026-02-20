import WidgetKit

/// Timeline entry for the node status widget
struct NodeStatusEntry: TimelineEntry {
    let date: Date
    let isConnected: Bool
    let onlineNodes: Int
    let totalNodes: Int
    let activeTasks: Int
    let health: HealthState

    enum HealthState {
        case healthy
        case degraded
        case offline
        case unknown
    }

    /// Placeholder entry for widget gallery
    static var placeholder: NodeStatusEntry {
        NodeStatusEntry(
            date: Date(),
            isConnected: true,
            onlineNodes: 3,
            totalNodes: 3,
            activeTasks: 2,
            health: .healthy
        )
    }

    /// Entry shown when data can't be fetched
    static var offline: NodeStatusEntry {
        NodeStatusEntry(
            date: Date(),
            isConnected: false,
            onlineNodes: 0,
            totalNodes: 0,
            activeTasks: 0,
            health: .offline
        )
    }
}
