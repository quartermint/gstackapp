import Foundation
import Combine
import MissionControlNetworking

/// View model for monitoring system and node status
@MainActor
final class StatusViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published private(set) var nodes: [Node] = []
    @Published private(set) var systemStatus: SystemStatus?
    @Published private(set) var isConnected = false
    @Published private(set) var isLoading = false
    @Published var error: Error?

    /// Timestamp of last successful refresh
    @Published private(set) var lastUpdated: Date?

    // MARK: - Computed Properties

    /// Count of online nodes
    var onlineNodeCount: Int {
        nodes.filter { $0.status == .online }.count
    }

    /// Count of offline nodes
    var offlineNodeCount: Int {
        nodes.filter { $0.status == .offline }.count
    }

    /// Count of busy nodes
    var busyNodeCount: Int {
        nodes.filter { $0.status == .busy }.count
    }

    /// Overall system health indicator
    var isHealthy: Bool {
        guard let status = systemStatus else { return false }
        return status.nodes.online > 0
    }

    // MARK: - Dependencies

    private let apiClient: APIClient
    private var refreshTask: Task<Void, Never>?
    private var autoRefreshEnabled = false

    // MARK: - Initialization

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    deinit {
        refreshTask?.cancel()
    }

    // MARK: - Public Methods

    /// Refresh all status data
    func refresh() async {
        isLoading = true
        error = nil

        do {
            // Fetch nodes and health status in parallel
            async let nodesResult = apiClient.getNodes()
            async let healthResult = apiClient.getHealth()

            let (fetchedNodes, fetchedHealth) = try await (nodesResult, healthResult)

            nodes = fetchedNodes
            systemStatus = fetchedHealth
            isConnected = true
            lastUpdated = Date()

        } catch {
            self.error = error
            isConnected = false
        }

        isLoading = false
    }

    /// Check connection to the Hub
    func checkConnection() async {
        await apiClient.checkConnection()
        isConnected = apiClient.isConnected
    }

    /// Start automatic refresh at specified interval
    func startAutoRefresh(interval: TimeInterval = 30) {
        stopAutoRefresh()
        autoRefreshEnabled = true

        refreshTask = Task {
            while !Task.isCancelled && autoRefreshEnabled {
                await refresh()
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            }
        }
    }

    /// Stop automatic refresh
    func stopAutoRefresh() {
        autoRefreshEnabled = false
        refreshTask?.cancel()
        refreshTask = nil
    }

    /// Get a node by ID
    func node(withId id: String) -> Node? {
        nodes.first { $0.id == id }
    }

    /// Get nodes filtered by status
    func nodes(withStatus status: NodeStatus) -> [Node] {
        nodes.filter { $0.status == status }
    }
}

// MARK: - Node Details

extension StatusViewModel {
    /// Format the last seen time for a node
    func lastSeenText(for node: Node) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: node.lastHeartbeat, relativeTo: Date())
    }

    /// Format load percentage for display
    func loadText(for node: Node) -> String {
        return String(format: "%.0f%%", node.load * 100)
    }

    /// Get capabilities as a formatted string
    func capabilitiesText(for node: Node) -> String {
        guard !node.capabilities.isEmpty else {
            return "None"
        }
        return node.capabilities.joined(separator: ", ")
    }
}
