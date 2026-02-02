import SwiftUI
import MissionControlNetworking

/// Settings view for app configuration
struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var authService = AuthService.shared
    @StateObject private var notificationService = NotificationService.shared

    @AppStorage("hubURL") private var hubURL = "http://100.64.0.1:3000"
    @AppStorage("autoRefreshEnabled") private var autoRefreshEnabled = true
    @AppStorage("refreshInterval") private var refreshInterval = 30.0

    @State private var showingLoginSheet = false
    @State private var showingLogoutAlert = false

    var body: some View {
        NavigationStack {
            List {
                // Server configuration
                serverSection

                // Authentication
                authSection

                // Notifications
                notificationSection

                // App preferences
                preferencesSection

                // About
                aboutSection
            }
            .navigationTitle("Settings")
            .sheet(isPresented: $showingLoginSheet) {
                LoginView()
            }
            .alert("Sign Out", isPresented: $showingLogoutAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Sign Out", role: .destructive) {
                    authService.logout()
                }
            } message: {
                Text("Are you sure you want to sign out?")
            }
        }
    }

    // MARK: - Server Section

    private var serverSection: some View {
        Section {
            HStack {
                Image(systemName: "server.rack")
                    .foregroundStyle(.blue)
                    .frame(width: 24)

                TextField("Hub URL", text: $hubURL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
            }

            HStack {
                Image(systemName: appState.isConnected ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundStyle(appState.isConnected ? .green : .red)
                    .frame(width: 24)

                Text(appState.isConnected ? "Connected" : "Not Connected")

                Spacer()

                Button("Test") {
                    Task {
                        APIClient.shared.setBaseURL(URL(string: hubURL)!)
                        await appState.refresh()
                    }
                }
                .buttonStyle(.bordered)
            }
        } header: {
            Text("Server")
        } footer: {
            Text("Enter the URL of your Mission Control Hub. Use Tailscale IP for secure access.")
        }
    }

    // MARK: - Auth Section

    private var authSection: some View {
        Section {
            if authService.isAuthenticated {
                HStack {
                    Image(systemName: "person.fill.checkmark")
                        .foregroundStyle(.green)
                        .frame(width: 24)

                    Text("Signed In")

                    Spacer()

                    Button("Sign Out") {
                        showingLogoutAlert = true
                    }
                    .foregroundStyle(.red)
                }
            } else {
                HStack {
                    Image(systemName: "person.fill.xmark")
                        .foregroundStyle(.orange)
                        .frame(width: 24)

                    Text("Not Signed In")

                    Spacer()

                    Button("Sign In") {
                        showingLoginSheet = true
                    }
                    .buttonStyle(.bordered)
                }
            }
        } header: {
            Text("Authentication")
        } footer: {
            Text("Sign in to access authenticated features and sync across devices.")
        }
    }

    // MARK: - Notifications Section

    private var notificationSection: some View {
        Section {
            HStack {
                Image(systemName: notificationService.isAuthorized ? "bell.fill" : "bell.slash")
                    .foregroundStyle(notificationService.isAuthorized ? .blue : .gray)
                    .frame(width: 24)

                Text("Push Notifications")

                Spacer()

                if notificationService.isAuthorized {
                    Text("Enabled")
                        .foregroundStyle(.secondary)
                } else {
                    Button("Enable") {
                        Task {
                            await notificationService.requestAuthorization()
                        }
                    }
                    .buttonStyle(.bordered)
                }
            }

            if notificationService.isAuthorized {
                Toggle(isOn: .constant(true)) {
                    HStack {
                        Image(systemName: "checkmark.circle")
                            .frame(width: 24)
                        Text("Task Completion")
                    }
                }

                Toggle(isOn: .constant(true)) {
                    HStack {
                        Image(systemName: "exclamationmark.triangle")
                            .frame(width: 24)
                        Text("System Alerts")
                    }
                }
            }
        } header: {
            Text("Notifications")
        }
    }

    // MARK: - Preferences Section

    private var preferencesSection: some View {
        Section {
            Toggle(isOn: $autoRefreshEnabled) {
                HStack {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .foregroundStyle(.blue)
                        .frame(width: 24)
                    Text("Auto Refresh")
                }
            }

            if autoRefreshEnabled {
                HStack {
                    Image(systemName: "clock")
                        .foregroundStyle(.blue)
                        .frame(width: 24)

                    Text("Refresh Interval")

                    Spacer()

                    Picker("", selection: $refreshInterval) {
                        Text("10s").tag(10.0)
                        Text("30s").tag(30.0)
                        Text("60s").tag(60.0)
                        Text("5m").tag(300.0)
                    }
                    .pickerStyle(.menu)
                }
            }
        } header: {
            Text("Preferences")
        }
    }

    // MARK: - About Section

    private var aboutSection: some View {
        Section {
            LabeledContent("Version", value: appVersion)
            LabeledContent("Build", value: buildNumber)

            NavigationLink {
                LicenseView()
            } label: {
                Text("Open Source Licenses")
            }

            Link(destination: URL(string: "https://github.com/your-org/mission-control")!) {
                HStack {
                    Text("GitHub Repository")
                    Spacer()
                    Image(systemName: "arrow.up.right.square")
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            Text("About")
        }
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }
}

// MARK: - Login View

struct LoginView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var authService = AuthService.shared

    @State private var username = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Username", text: $username)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                }

                if let error = authService.error {
                    Section {
                        Text(error.localizedDescription)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task {
                            try? await authService.login(username: username, password: password)
                            if authService.isAuthenticated {
                                dismiss()
                            }
                        }
                    } label: {
                        if authService.isLoading {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Sign In")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(username.isEmpty || password.isEmpty || authService.isLoading)
                }
            }
            .navigationTitle("Sign In")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - License View

struct LicenseView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Open Source Licenses")
                    .font(.title2)
                    .fontWeight(.bold)

                Text("This app uses the following open source software:")
                    .foregroundStyle(.secondary)

                Divider()

                // Add licenses for dependencies here
                Text("No third-party dependencies")
                    .foregroundStyle(.secondary)
                    .italic()
            }
            .padding()
        }
        .navigationTitle("Licenses")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Preview

#Preview {
    SettingsView()
        .environmentObject(AppState())
}
