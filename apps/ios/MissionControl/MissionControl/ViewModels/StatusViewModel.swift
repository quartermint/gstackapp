import Foundation
import Observation
import MissionControlNetworking

/// View model for monitoring system and node status
@MainActor
@Observable
final class StatusViewModel {
    // MARK: - Properties

    private(set) var nodes: [Node] = []
    private(set) var systemStatus: SystemStatus?
    private(set) var overview: AdminOverview?
    private(set) var isConnected = false
    private(set) var isLoading = false
    var error: Error?

    /// Timestamp of last successful refresh
    private(set) var lastUpdated: Date?

    // MARK: - Node Action State

    private(set) var nodeActionInProgress: String?

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

    // Cleanup handled by view's onDisappear calling stopAutoRefresh()

    // MARK: - Public Methods

    /// Refresh all status data
    func refresh() async {
        isLoading = true
        error = nil

        do {
            async let nodesResult = apiClient.getNodes()
            async let healthResult = apiClient.getHealth()
            async let overviewResult = apiClient.getOverview()

            let (fetchedNodes, fetchedHealth) = try await (nodesResult, healthResult)

            nodes = fetchedNodes
            systemStatus = fetchedHealth
            isConnected = true
            lastUpdated = Date()

            // Overview may fail if not internal trust — that's OK
            if let fetchedOverview = try? await overviewResult {
                overview = fetchedOverview
            }

        } catch {
            self.error = error
            isConnected = false
        }

        isLoading = false
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

    // MARK: - Node Actions

    /// Drain a node (stop accepting new tasks)
    func drainNode(_ nodeId: String) async throws {
        nodeActionInProgress = nodeId
        defer { nodeActionInProgress = nil }
        _ = try await apiClient.drainNode(nodeId: nodeId)
        await refresh()
    }

    /// Enable a node (resume accepting tasks)
    func enableNode(_ nodeId: String) async throws {
        nodeActionInProgress = nodeId
        defer { nodeActionInProgress = nil }
        _ = try await apiClient.enableNode(nodeId: nodeId)
        await refresh()
    }

    /// Force a node offline
    func forceNodeOffline(_ nodeId: String) async throws {
        nodeActionInProgress = nodeId
        defer { nodeActionInProgress = nil }
        _ = try await apiClient.forceNodeOffline(nodeId: nodeId)
        await refresh()
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
