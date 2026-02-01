//
//  SettingsView.swift
//  MissionControl
//
//  Application settings and preferences.
//

import SwiftUI
import MissionControlModels

/// Settings section enumeration
enum SettingsSection: String, CaseIterable, Identifiable {
    case general = "General"
    case connection = "Connection"
    case compute = "Compute"
    case notifications = "Notifications"
    case about = "About"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .general: return "gear"
        case .connection: return "network"
        case .compute: return "cpu"
        case .notifications: return "bell"
        case .about: return "info.circle"
        }
    }
}

/// Main settings view
struct SettingsView: View {
    @State private var selectedSection: SettingsSection = .general

    var body: some View {
        NavigationSplitView {
            List(SettingsSection.allCases, selection: $selectedSection) { section in
                Label(section.rawValue, systemImage: section.icon)
                    .tag(section)
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 180, ideal: 200)
        } detail: {
            Group {
                switch selectedSection {
                case .general:
                    GeneralSettingsView()
                case .connection:
                    ConnectionSettingsView()
                case .compute:
                    ComputeSettingsView()
                case .notifications:
                    NotificationSettingsView()
                case .about:
                    AboutView()
                }
            }
            .frame(minWidth: 400)
        }
        .frame(width: 650, height: 450)
    }
}

/// General settings
struct GeneralSettingsView: View {
    @AppStorage("appMode") private var appMode: AppMode = .clientOnly
    @AppStorage("showInDock") private var showInDock: Bool = true
    @AppStorage("launchAtLogin") private var launchAtLogin: Bool = false
    @AppStorage("theme") private var theme: AppTheme = .system

    var body: some View {
        Form {
            Section("Appearance") {
                Picker("Theme", selection: $theme) {
                    ForEach(AppTheme.allCases, id: \.self) { theme in
                        Text(theme.rawValue).tag(theme)
                    }
                }

                Toggle("Show in Dock", isOn: $showInDock)
                    .onChange(of: showInDock) { _, newValue in
                        updateDockVisibility(newValue)
                    }
            }

            Section("Startup") {
                Toggle("Launch at Login", isOn: $launchAtLogin)
                    .onChange(of: launchAtLogin) { _, newValue in
                        updateLoginItem(newValue)
                    }
            }

            Section("Application Mode") {
                Picker("Run Mode", selection: $appMode) {
                    ForEach(AppMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.radioGroup)

                Text(appModeDescription)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .formStyle(.grouped)
        .navigationTitle("General")
    }

    private var appModeDescription: String {
        switch appMode {
        case .clientOnly:
            return "Use Mission Control as a chat client only."
        case .computeContributor:
            return "Contribute your Mac's idle compute resources to the network. Your Mac will process tasks when not busy."
        case .hybrid:
            return "Use Mission Control as a client and contribute idle compute resources."
        }
    }

    private func updateDockVisibility(_ visible: Bool) {
        if visible {
            NSApp.setActivationPolicy(.regular)
        } else {
            NSApp.setActivationPolicy(.accessory)
        }
    }

    private func updateLoginItem(_ enabled: Bool) {
        // SMAppService would be used here in a real implementation
        // SMAppService.mainApp.register() / unregister()
    }
}

/// App theme options
enum AppTheme: String, CaseIterable {
    case system = "System"
    case light = "Light"
    case dark = "Dark"
}

/// Connection settings
struct ConnectionSettingsView: View {
    @EnvironmentObject var appState: AppState
    @AppStorage("hubURL") private var hubURL: String = "https://hub.mission-control.local"
    @AppStorage("apiTimeout") private var apiTimeout: Double = 30.0

    @State private var isTestingConnection = false
    @State private var connectionTestResult: ConnectionTestResult?

    var body: some View {
        Form {
            Section("Hub Connection") {
                TextField("Hub URL", text: $hubURL)
                    .textFieldStyle(.roundedBorder)

                HStack {
                    Slider(value: $apiTimeout, in: 10...120, step: 5) {
                        Text("Timeout")
                    }
                    Text("\(Int(apiTimeout))s")
                        .monospacedDigit()
                        .frame(width: 40)
                }

                HStack {
                    Button("Test Connection") {
                        testConnection()
                    }
                    .disabled(isTestingConnection)

                    if isTestingConnection {
                        ProgressView()
                            .scaleEffect(0.8)
                    }

                    if let result = connectionTestResult {
                        HStack(spacing: 4) {
                            Image(systemName: result.success ? "checkmark.circle" : "xmark.circle")
                            Text(result.message)
                        }
                        .foregroundColor(result.success ? .green : .red)
                        .font(.caption)
                    }
                }
            }

            Section("Authentication") {
                AuthenticationSettingsSection()
            }

            Section("Status") {
                HStack {
                    Text("Connection")
                    Spacer()
                    Circle()
                        .fill(appState.connectionStatus.color)
                        .frame(width: 8, height: 8)
                    Text(appState.connectionStatus.description)
                        .foregroundColor(.secondary)
                }

                Button("Reconnect") {
                    Task {
                        await appState.connect()
                    }
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Connection")
    }

    private func testConnection() {
        isTestingConnection = true
        connectionTestResult = nil

        Task {
            do {
                let health = try await appState.apiClient.checkHealth()
                await MainActor.run {
                    connectionTestResult = ConnectionTestResult(
                        success: health.status == "ok",
                        message: health.status == "ok" ? "Connected successfully" : "Hub unhealthy"
                    )
                    isTestingConnection = false
                }
            } catch {
                await MainActor.run {
                    connectionTestResult = ConnectionTestResult(
                        success: false,
                        message: error.localizedDescription
                    )
                    isTestingConnection = false
                }
            }
        }
    }
}

struct ConnectionTestResult {
    let success: Bool
    let message: String
}

/// Authentication settings section
struct AuthenticationSettingsSection: View {
    @EnvironmentObject var appState: AppState
    @State private var token: String = ""
    @State private var showToken = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                if showToken {
                    TextField("API Token", text: $token)
                        .textFieldStyle(.roundedBorder)
                } else {
                    SecureField("API Token", text: $token)
                        .textFieldStyle(.roundedBorder)
                }

                Button(action: { showToken.toggle() }) {
                    Image(systemName: showToken ? "eye.slash" : "eye")
                }
                .buttonStyle(.borderless)
            }

            HStack {
                Button("Save Token") {
                    saveToken()
                }
                .disabled(token.isEmpty)

                Button("Clear Token") {
                    clearToken()
                }
                .foregroundColor(.red)

                Spacer()

                if appState.keychainService.hasAuthToken() {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("Token saved")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
        .onAppear {
            // Don't load actual token for security
            token = appState.keychainService.hasAuthToken() ? "********" : ""
        }
    }

    private func saveToken() {
        appState.keychainService.saveAuthToken(token)
        appState.apiClient.setAuthToken(token)
        NotificationCenter.default.post(name: .authStateChanged, object: nil)
    }

    private func clearToken() {
        appState.keychainService.deleteAuthToken()
        appState.apiClient.setAuthToken(nil)
        token = ""
        NotificationCenter.default.post(name: .authStateChanged, object: nil)
    }
}

/// Compute mode settings
struct ComputeSettingsView: View {
    @EnvironmentObject var appState: AppState
    @AppStorage("computeEnabled") private var computeEnabled: Bool = false
    @AppStorage("maxCPUPercent") private var maxCPUPercent: Double = 50.0
    @AppStorage("maxMemoryMB") private var maxMemoryMB: Double = 2048.0
    @AppStorage("maxConcurrentTasks") private var maxConcurrentTasks: Double = 2.0
    @AppStorage("taskTimeoutSeconds") private var taskTimeoutSeconds: Double = 300.0
    @AppStorage("idleBeforeCompute") private var idleBeforeCompute: Double = 5.0

    var body: some View {
        Form {
            Section {
                Toggle("Enable Compute Contribution", isOn: $computeEnabled)
                    .onChange(of: computeEnabled) { _, newValue in
                        if newValue {
                            appState.computeManager.start()
                        } else {
                            appState.computeManager.stop()
                        }
                    }

                Text("When enabled, your Mac will contribute idle compute resources to help process tasks.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Section("Resource Limits") {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Max CPU Usage")
                        Spacer()
                        Text("\(Int(maxCPUPercent))%")
                            .monospacedDigit()
                    }
                    Slider(value: $maxCPUPercent, in: 10...90, step: 10)
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Max Memory")
                        Spacer()
                        Text("\(Int(maxMemoryMB)) MB")
                            .monospacedDigit()
                    }
                    Slider(value: $maxMemoryMB, in: 512...8192, step: 256)
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Max Concurrent Tasks")
                        Spacer()
                        Text("\(Int(maxConcurrentTasks))")
                            .monospacedDigit()
                    }
                    Slider(value: $maxConcurrentTasks, in: 1...8, step: 1)
                }
            }

            Section("Execution") {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Task Timeout")
                        Spacer()
                        Text("\(Int(taskTimeoutSeconds))s")
                            .monospacedDigit()
                    }
                    Slider(value: $taskTimeoutSeconds, in: 60...600, step: 30)
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Idle Time Before Contributing")
                        Spacer()
                        Text("\(Int(idleBeforeCompute)) min")
                            .monospacedDigit()
                    }
                    Slider(value: $idleBeforeCompute, in: 1...30, step: 1)
                }
            }

            Section("Security") {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "shield.checkered")
                            .foregroundColor(.green)
                        Text("All tasks run in isolated sandbox")
                    }

                    HStack {
                        Image(systemName: "checkmark.shield")
                            .foregroundColor(.green)
                        Text("Only approved commands allowed")
                    }

                    HStack {
                        Image(systemName: "lock.shield")
                            .foregroundColor(.green)
                        Text("Tasks from trusted Hub only")
                    }
                }
                .font(.caption)
            }

            if computeEnabled {
                Section("Statistics") {
                    HStack {
                        Text("Tasks Completed")
                        Spacer()
                        Text("\(appState.computeManager.tasksCompleted)")
                    }

                    HStack {
                        Text("Active Tasks")
                        Spacer()
                        Text("\(appState.computeManager.activeTasks)")
                    }

                    HStack {
                        Text("Uptime")
                        Spacer()
                        Text(formatUptime(appState.computeManager.uptime))
                    }
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Compute")
    }

    private func formatUptime(_ seconds: TimeInterval) -> String {
        let hours = Int(seconds) / 3600
        let minutes = (Int(seconds) % 3600) / 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        }
        return "\(minutes)m"
    }
}

/// Notification settings
struct NotificationSettingsView: View {
    @AppStorage("notifyOnMessage") private var notifyOnMessage: Bool = true
    @AppStorage("notifyOnTaskComplete") private var notifyOnTaskComplete: Bool = true
    @AppStorage("notifyOnTaskFailed") private var notifyOnTaskFailed: Bool = true
    @AppStorage("notifyOnDisconnect") private var notifyOnDisconnect: Bool = true
    @AppStorage("soundEnabled") private var soundEnabled: Bool = true

    var body: some View {
        Form {
            Section("Chat") {
                Toggle("New Message Received", isOn: $notifyOnMessage)
            }

            Section("Tasks") {
                Toggle("Task Completed", isOn: $notifyOnTaskComplete)
                Toggle("Task Failed", isOn: $notifyOnTaskFailed)
            }

            Section("Connection") {
                Toggle("Disconnected from Hub", isOn: $notifyOnDisconnect)
            }

            Section("Sound") {
                Toggle("Play Sound", isOn: $soundEnabled)
            }

            Section {
                Button("Request Notification Permission") {
                    requestNotificationPermission()
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Notifications")
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                print("Notification permission error: \(error)")
            }
        }
    }
}

import UserNotifications

/// About view
struct AboutView: View {
    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"

    var body: some View {
        VStack(spacing: 20) {
            // App icon
            Image(systemName: "antenna.radiowaves.left.and.right.circle.fill")
                .font(.system(size: 64))
                .foregroundColor(.accentColor)

            // App name
            Text("Mission Control")
                .font(.title)
                .fontWeight(.bold)

            // Version
            Text("Version \(version) (\(build))")
                .font(.caption)
                .foregroundColor(.secondary)

            Divider()
                .frame(width: 200)

            // Description
            Text("AI Orchestration System")
                .font(.headline)

            Text("A multi-node AI orchestration system that routes requests through a secure pipeline.")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 300)

            Spacer()

            // Links
            HStack(spacing: 20) {
                Button("Documentation") {
                    openURL("https://mission-control.docs")
                }
                .buttonStyle(.link)

                Button("GitHub") {
                    openURL("https://github.com/mission-control")
                }
                .buttonStyle(.link)

                Button("Support") {
                    openURL("mailto:support@mission-control.dev")
                }
                .buttonStyle(.link)
            }

            Spacer()

            // Copyright
            Text("Copyright 2024 Mission Control Team")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func openURL(_ urlString: String) {
        if let url = URL(string: urlString) {
            NSWorkspace.shared.open(url)
        }
    }
}

// MARK: - Preview

#Preview {
    SettingsView()
        .environmentObject(AppState())
}
