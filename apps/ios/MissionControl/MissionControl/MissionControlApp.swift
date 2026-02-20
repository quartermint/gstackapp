import SwiftUI
import Observation
import MissionControlNetworking
import BackgroundTasks

/// Main entry point for the Mission Control iOS app
@main
struct MissionControlApp: App {
    @State private var appState = AppState()
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
                .onAppear {
                    if let storedURL = UserDefaults.standard.string(forKey: "hubURL"),
                       let url = URL(string: storedURL) {
                        APIClient.shared.setBaseURL(url)
                    }
                }
                .onChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .active:
                        PollingManager.shared.setForeground()
                        Task { await appState.refresh() }
                    case .background:
                        PollingManager.shared.setBackground()
                        scheduleBackgroundRefresh()
                    case .inactive:
                        break
                    @unknown default:
                        break
                    }
                }
        }
    }

    private func scheduleBackgroundRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: "com.missioncontrol.refresh")
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("Failed to schedule background refresh: \(error)")
        }
    }
}

// MARK: - App State

/// Shared application state
@MainActor
@Observable
final class AppState {
    var isConnected = false
    var nodes: [Node] = []
    var activeTasks: [MCTask] = []

    /// Count of currently active tasks
    var activeTaskCount: Int {
        activeTasks.filter { isTaskActive($0) }.count
    }

    private let apiClient = APIClient.shared

    /// Check if a task is active
    private func isTaskActive(_ task: MCTask) -> Bool {
        switch task.status {
        case .pending, .running:
            return true
        case .completed, .failed, .cancelled:
            return false
        }
    }

    /// Refresh all app state from server
    func refresh() async {
        do {
            async let nodesResult = apiClient.getNodes()
            async let tasksResult = apiClient.getTasks()

            let (fetchedNodes, fetchedTasks) = try await (nodesResult, tasksResult)

            nodes = fetchedNodes
            activeTasks = fetchedTasks.filter { isTaskActive($0) }
            isConnected = true
        } catch {
            isConnected = false
            print("Failed to refresh app state: \(error)")
        }
    }
}

// MARK: - App Delegate

/// UIApplicationDelegate for handling system callbacks
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Request notification authorization
        Task {
            await NotificationService.shared.checkAuthorizationStatus()
        }

        // Register background task handler
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.missioncontrol.refresh",
            using: nil
        ) { task in
            self.handleBackgroundRefresh(task: task as! BGAppRefreshTask)
        }

        return true
    }

    // MARK: - Remote Notifications

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            NotificationService.shared.handleDeviceToken(deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in
            NotificationService.shared.handleRegistrationError(error)
        }
    }

    // MARK: - Background Refresh

    private func handleBackgroundRefresh(task: BGAppRefreshTask) {
        // Schedule next refresh
        let nextRequest = BGAppRefreshTaskRequest(identifier: "com.missioncontrol.refresh")
        nextRequest.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(nextRequest)

        let refreshTask = Task { @MainActor in
            do {
                let _: SystemStatus = try await APIClient.shared.getHealth()
                let _: [MCTask] = try await APIClient.shared.getTasks(status: .running)
            } catch {
                print("Background refresh failed: \(error)")
            }
        }

        task.expirationHandler = {
            refreshTask.cancel()
        }

        Task {
            await refreshTask.value
            task.setTaskCompleted(success: true)
        }
    }
}
