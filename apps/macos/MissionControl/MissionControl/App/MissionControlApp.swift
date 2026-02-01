//
//  MissionControlApp.swift
//  MissionControl
//
//  Main application entry point for Mission Control macOS client.
//  Supports dual-mode operation: user client and compute contributor.
//

import SwiftUI

/// Application run mode
enum AppMode: String, CaseIterable {
    case clientOnly = "Client Only"
    case computeContributor = "Compute Contributor"
    case hybrid = "Client + Compute"
}

/// Main application entry point
@main
struct MissionControlApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var appState = AppState()
    @AppStorage("appMode") private var appMode: AppMode = .clientOnly
    @AppStorage("showInDock") private var showInDock: Bool = true

    var body: some Scene {
        // Main window
        WindowGroup {
            MainView()
                .environmentObject(appState)
                .onAppear {
                    configureAppMode()
                }
        }
        .windowStyle(.automatic)
        .windowToolbarStyle(.unified(showsTitle: true))
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Conversation") {
                    appState.createNewConversation()
                }
                .keyboardShortcut("n", modifiers: .command)
            }

            CommandGroup(after: .windowArrangement) {
                Button("Show Quick Chat") {
                    appDelegate.showQuickChat()
                }
                .keyboardShortcut("m", modifiers: [.command, .shift])
            }

            CommandGroup(replacing: .help) {
                Button("Mission Control Help") {
                    openHelp()
                }
            }
        }

        // Settings window
        Settings {
            SettingsView()
                .environmentObject(appState)
        }

        // Menu bar extra (always available)
        MenuBarExtra {
            MenuBarView()
                .environmentObject(appState)
        } label: {
            Image(systemName: appState.connectionStatus.iconName)
        }
        .menuBarExtraStyle(.menu)
    }

    private func configureAppMode() {
        // Configure dock visibility
        if showInDock {
            NSApp.setActivationPolicy(.regular)
        } else {
            NSApp.setActivationPolicy(.accessory)
        }

        // Start compute mode if enabled
        if appMode == .computeContributor || appMode == .hybrid {
            appState.computeManager.start()
        }
    }

    private func openHelp() {
        if let url = URL(string: "https://mission-control.docs/macos") {
            NSWorkspace.shared.open(url)
        }
    }
}

/// Menu bar dropdown view
struct MenuBarView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Status section
            HStack {
                Circle()
                    .fill(appState.connectionStatus.color)
                    .frame(width: 8, height: 8)
                Text(appState.connectionStatus.description)
                    .font(.caption)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)

            Divider()

            // Compute mode status
            if appState.computeManager.isEnabled {
                HStack {
                    Image(systemName: "cpu")
                    Text("Compute: \(appState.computeManager.activeTasks) active")
                        .font(.caption)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)

                Divider()
            }

            // Quick actions
            Button("Open Mission Control") {
                openMainWindow()
            }
            .keyboardShortcut("o", modifiers: .command)

            Button("Quick Chat...") {
                NotificationCenter.default.post(name: .showQuickChat, object: nil)
            }
            .keyboardShortcut("m", modifiers: [.command, .shift])

            Divider()

            Button("Settings...") {
                openSettings()
            }
            .keyboardShortcut(",", modifiers: .command)

            Divider()

            Button("Quit Mission Control") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q", modifiers: .command)
        }
    }

    private func openMainWindow() {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        if let window = NSApp.windows.first {
            window.makeKeyAndOrderFront(nil)
        }
    }

    private func openSettings() {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }
}

/// Connection status enumeration
enum ConnectionStatus: String {
    case connected
    case connecting
    case disconnected
    case error

    var iconName: String {
        switch self {
        case .connected: return "antenna.radiowaves.left.and.right"
        case .connecting: return "antenna.radiowaves.left.and.right.slash"
        case .disconnected: return "antenna.radiowaves.left.and.right.slash"
        case .error: return "exclamationmark.triangle"
        }
    }

    var color: Color {
        switch self {
        case .connected: return .green
        case .connecting: return .yellow
        case .disconnected: return .gray
        case .error: return .red
        }
    }

    var description: String {
        switch self {
        case .connected: return "Connected"
        case .connecting: return "Connecting..."
        case .disconnected: return "Disconnected"
        case .error: return "Error"
        }
    }
}

/// Global app state
@MainActor
class AppState: ObservableObject {
    @Published var connectionStatus: ConnectionStatus = .disconnected
    @Published var conversations: [Conversation] = []
    @Published var currentConversation: Conversation?
    @Published var tasks: [TaskItem] = []
    @Published var nodes: [NodeInfo] = []

    let apiClient = APIClient()
    let computeManager = ComputeManager()
    let keychainService = KeychainService()

    init() {
        setupObservers()
        Task {
            await connect()
        }
    }

    private func setupObservers() {
        // Listen for auth changes
        NotificationCenter.default.addObserver(
            forName: .authStateChanged,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task {
                await self?.connect()
            }
        }
    }

    func connect() async {
        connectionStatus = .connecting

        // Load token from keychain
        if let token = keychainService.getAuthToken() {
            apiClient.setAuthToken(token)
        }

        do {
            let health = try await apiClient.checkHealth()
            if health.status == "ok" {
                connectionStatus = .connected
                await loadInitialData()
            } else {
                connectionStatus = .error
            }
        } catch {
            connectionStatus = .disconnected
        }
    }

    private func loadInitialData() async {
        do {
            async let convos = apiClient.listConversations()
            async let taskList = apiClient.listTasks()
            async let nodeList = apiClient.listNodes()

            conversations = try await convos
            tasks = try await taskList
            nodes = try await nodeList
        } catch {
            print("Failed to load initial data: \(error)")
        }
    }

    func createNewConversation() {
        let newConvo = Conversation(
            id: UUID().uuidString,
            title: "New Conversation",
            messages: [],
            createdAt: Date(),
            updatedAt: Date()
        )
        conversations.insert(newConvo, at: 0)
        currentConversation = newConvo
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let showQuickChat = Notification.Name("showQuickChat")
    static let authStateChanged = Notification.Name("authStateChanged")
}

// MARK: - Data Models

struct Conversation: Identifiable, Codable {
    let id: String
    var title: String
    var messages: [Message]
    let createdAt: Date
    var updatedAt: Date
}

struct Message: Identifiable, Codable {
    let id: String
    let role: MessageRole
    let content: String
    let timestamp: Date
}

enum MessageRole: String, Codable {
    case user
    case assistant
    case system
}

struct TaskItem: Identifiable, Codable {
    let id: String
    let type: String
    let status: TaskStatus
    let payload: String
    let assignedNode: String?
    let createdAt: Date
    var updatedAt: Date
}

enum TaskStatus: String, Codable {
    case pending
    case assigned
    case running
    case completed
    case failed
}

struct NodeInfo: Identifiable, Codable {
    let id: String
    let hostname: String
    let status: NodeStatus
    let lastHeartbeat: Date
    let capabilities: [String]
    let metrics: NodeMetrics?
}

enum NodeStatus: String, Codable {
    case online
    case offline
    case busy
}

struct NodeMetrics: Codable {
    let cpuUsage: Double
    let memoryUsage: Double
    let activeTasks: Int
}
