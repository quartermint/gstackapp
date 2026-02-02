//
//  MissionControlApp.swift
//  MissionControl
//
//  Main application entry point for Mission Control macOS client.
//  Supports dual-mode operation: user client and compute contributor.
//

import SwiftUI
import MissionControlModels
import MissionControlNetworking

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
    @Published var conversations: [AppConversation] = []
    @Published var currentConversation: AppConversation?
    @Published var tasks: [AppTask] = []
    @Published var nodes: [AppNode] = []

    let apiClient = APIClient()
    let computeManager: ComputeManager
    let keychainService: KeychainService

    init() {
        // Create shared keychain service
        let keychain = KeychainService()
        self.keychainService = keychain

        // Pass keychain to compute manager for token access
        self.computeManager = ComputeManager(keychainService: keychain)

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

        // Load token from keychain, or use default dev token for internal builds
        if let token = keychainService.getAuthToken() {
            apiClient.setAuthToken(token)
        } else {
            // Use default development token for internal use
            apiClient.setAuthToken(APIConfiguration.defaultDevToken)
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
        let newConvo = AppConversation(
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

// MARK: - App-specific View Models (wrappers around shared models)

/// App-specific conversation wrapper for mutable messages array
struct AppConversation: Identifiable, Codable {
    let id: String
    var title: String
    var messages: [AppMessage]
    let createdAt: Date
    var updatedAt: Date

    /// Convert from shared Conversation model
    init(from conversation: Conversation) {
        self.id = conversation.id
        self.title = conversation.title
        self.messages = []  // Messages loaded separately
        self.createdAt = conversation.createdAt
        self.updatedAt = conversation.updatedAt
    }

    /// Create a new local conversation
    init(id: String, title: String, messages: [AppMessage], createdAt: Date, updatedAt: Date) {
        self.id = id
        self.title = title
        self.messages = messages
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

/// App-specific message wrapper with timestamp as Date
struct AppMessage: Identifiable, Codable {
    let id: String
    let role: MessageRole
    let content: String
    let timestamp: Date

    /// Convert from shared Message model
    init(from message: Message) {
        self.id = message.id
        self.role = message.role
        self.content = message.content
        self.timestamp = message.createdAt
    }

    /// Create a new local message
    init(id: String, role: MessageRole, content: String, timestamp: Date) {
        self.id = id
        self.role = role
        self.content = content
        self.timestamp = timestamp
    }
}

/// App-specific task wrapper
struct AppTask: Identifiable, Codable {
    let id: String
    let type: String
    let status: AppTaskStatus
    let payload: String
    let assignedNode: String?
    let createdAt: Date
    var updatedAt: Date

    /// Convert from shared MCTask model
    init(from task: MCTask) {
        self.id = task.id
        self.type = task.command
        self.status = AppTaskStatus(from: task.status)
        self.payload = task.command
        self.assignedNode = task.nodeId
        self.createdAt = task.createdAt
        self.updatedAt = task.updatedAt
    }

    /// Create a new local task
    init(id: String, type: String, status: AppTaskStatus, payload: String, assignedNode: String?, createdAt: Date, updatedAt: Date) {
        self.id = id
        self.type = type
        self.status = status
        self.payload = payload
        self.assignedNode = assignedNode
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

/// App-specific task status (includes assigned state for UI)
enum AppTaskStatus: String, Codable, CaseIterable {
    case pending
    case assigned
    case running
    case completed
    case failed

    init(from status: TaskStatus) {
        switch status {
        case .pending: self = .pending
        case .running: self = .running
        case .completed: self = .completed
        case .failed: self = .failed
        case .cancelled: self = .failed
        }
    }

    var color: Color {
        switch self {
        case .pending: return .yellow
        case .assigned: return .blue
        case .running: return .orange
        case .completed: return .green
        case .failed: return .red
        }
    }
}

/// App-specific node wrapper
struct AppNode: Identifiable, Codable {
    let id: String
    let hostname: String
    let status: AppNodeStatus
    let lastHeartbeat: Date
    let capabilities: [String]
    let metrics: AppNodeMetrics?

    /// Convert from shared Node model
    init(from node: Node) {
        self.id = node.id
        self.hostname = node.hostname
        self.status = AppNodeStatus(from: node.status)
        self.lastHeartbeat = node.lastHeartbeat
        self.capabilities = node.capabilities
        self.metrics = AppNodeMetrics(
            cpuUsage: node.load * 100,
            memoryUsage: 0,  // Not available in shared model
            activeTasks: node.currentTasks
        )
    }

    /// Create a new local node
    init(id: String, hostname: String, status: AppNodeStatus, lastHeartbeat: Date, capabilities: [String], metrics: AppNodeMetrics?) {
        self.id = id
        self.hostname = hostname
        self.status = status
        self.lastHeartbeat = lastHeartbeat
        self.capabilities = capabilities
        self.metrics = metrics
    }
}

/// App-specific node status
enum AppNodeStatus: String, Codable {
    case online
    case offline
    case busy

    init(from status: NodeStatus) {
        switch status {
        case .online: self = .online
        case .offline: self = .offline
        case .busy: self = .busy
        case .draining: self = .busy
        }
    }
}

/// App-specific node metrics
struct AppNodeMetrics: Codable {
    let cpuUsage: Double
    let memoryUsage: Double
    let activeTasks: Int
}
