import Foundation
import Network
import Observation
import MissionControlNetworking

/// Monitors network connectivity and Hub reachability
@MainActor
@Observable
final class ConnectionMonitor {
    static let shared = ConnectionMonitor()

    private(set) var isConnected = true
    private(set) var isOffline = false

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.missioncontrol.network-monitor")

    private init() {
        startMonitoring()
    }

    // MARK: - Network Monitoring

    private func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasOffline = self.isOffline
                self.isOffline = path.status != .satisfied

                // If we came back online, check Hub reachability
                if wasOffline && !self.isOffline {
                    await self.checkConnection()
                }
            }
        }
        monitor.start(queue: monitorQueue)
    }

    /// Check if the Hub is reachable by hitting /health
    func checkConnection() async {
        guard !isOffline else {
            isConnected = false
            return
        }

        do {
            let _: SystemStatus = try await APIClient.shared.getHealth()
            isConnected = true
        } catch {
            isConnected = false
        }
    }
}
