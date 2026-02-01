import SwiftUI

/// Main entry point for the Mission Control iOS app
@main
struct MissionControlApp: App {
    @StateObject private var appState = AppState()
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .onAppear {
                    // Configure API client with stored URL
                    if let storedURL = UserDefaults.standard.string(forKey: "hubURL"),
                       let url = URL(string: storedURL) {
                        APIClient.shared.setBaseURL(url)
                    }
                }
        }
    }
}

// MARK: - App State

/// Shared application state
@MainActor
final class AppState: ObservableObject {
    @Published var isConnected = false
    @Published var nodes: [Node] = []
    @Published var activeTasks: [MCTask] = []

    /// Count of currently active tasks
    var activeTaskCount: Int {
        activeTasks.filter { $0.status.isActive }.count
    }

    private let apiClient = APIClient.shared

    /// Refresh all app state from server
    func refresh() async {
        do {
            async let nodesResult = apiClient.getNodes()
            async let tasksResult = apiClient.getTasks()

            let (fetchedNodes, fetchedTasks) = try await (nodesResult, tasksResult)

            nodes = fetchedNodes
            activeTasks = fetchedTasks.filter { $0.status.isActive }
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
}
