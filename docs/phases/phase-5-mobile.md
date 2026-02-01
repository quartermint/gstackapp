# Phase 5: Mobile Apps

This phase implements iOS and watchOS companion apps for monitoring and quick interactions.

## Overview

Mobile apps provide:
- Real-time system monitoring
- Quick chat interface
- Push notifications for task completion
- Watch complications for status

```
iOS App ←→ Tailscale ←→ Hub
   ↓
watchOS Companion
```

## Prerequisites

- Xcode 15+
- Apple Developer account
- iOS 17+ device
- Apple Watch (optional)
- Tailscale iOS app installed

## Part 1: iOS App Structure

### 1.1 Create Xcode Project

1. Open Xcode → File → New → Project
2. Choose: iOS → App
3. Settings:
   - Product Name: Mission Control
   - Bundle ID: com.yourdomain.mission-control
   - Language: Swift
   - Interface: SwiftUI
   - Include Tests: Yes

### 1.2 Project Structure

```
MissionControl/
├── MissionControlApp.swift
├── Views/
│   ├── ContentView.swift
│   ├── ChatView.swift
│   ├── StatusView.swift
│   └── SettingsView.swift
├── Models/
│   ├── Message.swift
│   ├── Task.swift
│   └── Node.swift
├── Services/
│   ├── APIClient.swift
│   ├── ConvexClient.swift
│   └── NotificationService.swift
├── Resources/
│   └── Assets.xcassets
└── MissionControl.entitlements
```

## Part 2: Core Implementation

### 2.1 App Entry Point

```swift
// MissionControlApp.swift
import SwiftUI

@main
struct MissionControlApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
    }
}

class AppState: ObservableObject {
    @Published var isConnected = false
    @Published var nodes: [Node] = []
    @Published var activeTasks: [Task] = []

    private let api = APIClient()

    func refresh() async {
        do {
            nodes = try await api.getNodes()
            activeTasks = try await api.getTasks()
            isConnected = true
        } catch {
            isConnected = false
        }
    }
}
```

### 2.2 API Client

```swift
// Services/APIClient.swift
import Foundation

class APIClient {
    private let baseURL: URL
    private let session: URLSession

    init() {
        // Use Tailscale IP or hostname
        baseURL = URL(string: "http://100.x.x.x:3000")!
        session = URLSession.shared
    }

    func chat(message: String) async throws -> ChatResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("/chat"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(ChatRequest(message: message))

        let (data, _) = try await session.data(for: request)
        return try JSONDecoder().decode(ChatResponse.self, from: data)
    }

    func getNodes() async throws -> [Node] {
        let (data, _) = try await session.data(from: baseURL.appendingPathComponent("/nodes"))
        return try JSONDecoder().decode([Node].self, from: data)
    }

    func getTasks() async throws -> [Task] {
        let (data, _) = try await session.data(from: baseURL.appendingPathComponent("/tasks"))
        return try JSONDecoder().decode([Task].self, from: data)
    }
}
```

### 2.3 Chat View

```swift
// Views/ChatView.swift
import SwiftUI

struct ChatView: View {
    @State private var message = ""
    @State private var messages: [Message] = []
    @State private var isLoading = false

    private let api = APIClient()

    var body: some View {
        VStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(messages) { msg in
                        MessageBubble(message: msg)
                    }
                }
                .padding()
            }

            HStack {
                TextField("Message", text: $message)
                    .textFieldStyle(.roundedBorder)
                    .disabled(isLoading)

                Button(action: sendMessage) {
                    if isLoading {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                    }
                }
                .disabled(message.isEmpty || isLoading)
            }
            .padding()
        }
        .navigationTitle("Chat")
    }

    func sendMessage() {
        let text = message
        message = ""
        isLoading = true

        messages.append(Message(role: .user, content: text))

        Task {
            do {
                let response = try await api.chat(message: text)
                messages.append(Message(role: .assistant, content: response.message))
            } catch {
                messages.append(Message(role: .system, content: "Error: \(error.localizedDescription)"))
            }
            isLoading = false
        }
    }
}

struct MessageBubble: View {
    let message: Message

    var body: some View {
        HStack {
            if message.role == .user { Spacer() }

            Text(message.content)
                .padding(12)
                .background(message.role == .user ? Color.blue : Color.gray.opacity(0.2))
                .foregroundColor(message.role == .user ? .white : .primary)
                .cornerRadius(16)

            if message.role != .user { Spacer() }
        }
    }
}
```

### 2.4 Status View

```swift
// Views/StatusView.swift
import SwiftUI

struct StatusView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        List {
            Section("System Status") {
                HStack {
                    Circle()
                        .fill(appState.isConnected ? .green : .red)
                        .frame(width: 12, height: 12)
                    Text(appState.isConnected ? "Connected" : "Disconnected")
                }
            }

            Section("Nodes") {
                ForEach(appState.nodes) { node in
                    NodeRow(node: node)
                }
            }

            Section("Active Tasks (\(appState.activeTasks.count))") {
                ForEach(appState.activeTasks) { task in
                    TaskRow(task: task)
                }
            }
        }
        .refreshable {
            await appState.refresh()
        }
        .navigationTitle("Status")
    }
}

struct NodeRow: View {
    let node: Node

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(node.hostname)
                    .font(.headline)
                Text(node.type)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Spacer()
            Circle()
                .fill(node.status == "online" ? .green : .gray)
                .frame(width: 10, height: 10)
        }
    }
}
```

## Part 3: watchOS Companion

### 3.1 Add Watch Target

1. File → New → Target
2. Choose: watchOS → Watch App
3. Settings:
   - Product Name: Mission Control Watch
   - Bundle ID: com.yourdomain.mission-control.watchkitapp
   - Include Notification Scene: Yes
   - Include Complications: Yes

### 3.2 Watch App Structure

```
MissionControlWatch/
├── MissionControlWatchApp.swift
├── ContentView.swift
├── QuickChatView.swift
├── StatusGlanceView.swift
└── Complications/
    └── ComplicationViews.swift
```

### 3.3 Watch Implementation

```swift
// MissionControlWatch/ContentView.swift
import SwiftUI

struct ContentView: View {
    @State private var status: SystemStatus?

    var body: some View {
        TabView {
            StatusGlanceView(status: status)
            QuickChatView()
        }
        .tabViewStyle(.page)
        .task {
            await refreshStatus()
        }
    }

    func refreshStatus() async {
        // Fetch from iOS app via WatchConnectivity
        // or directly from Hub if on same Tailscale network
    }
}

struct StatusGlanceView: View {
    let status: SystemStatus?

    var body: some View {
        VStack {
            Image(systemName: status?.isHealthy == true ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                .font(.system(size: 40))
                .foregroundColor(status?.isHealthy == true ? .green : .red)

            Text(status?.isHealthy == true ? "All Systems Go" : "Issues Detected")
                .font(.headline)

            if let nodeCount = status?.nodeCount {
                Text("\(nodeCount) nodes online")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}

struct QuickChatView: View {
    @State private var lastResponse: String?

    let quickCommands = [
        "Status report",
        "Any errors?",
        "List tasks"
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                ForEach(quickCommands, id: \.self) { cmd in
                    Button(cmd) {
                        sendQuickCommand(cmd)
                    }
                    .buttonStyle(.borderedProminent)
                }

                if let response = lastResponse {
                    Text(response)
                        .font(.caption)
                        .padding()
                }
            }
        }
    }

    func sendQuickCommand(_ command: String) {
        // Send via WatchConnectivity or direct API
    }
}
```

### 3.4 Complications

```swift
// Complications/ComplicationViews.swift
import SwiftUI
import ClockKit

struct ComplicationViews: View {
    var body: some View {
        // Circular
        ZStack {
            Circle()
                .stroke(lineWidth: 2)
            Image(systemName: "server.rack")
        }
    }
}

// WidgetKit complication provider
struct StatusComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: "com.mission-control.status",
            provider: StatusProvider()
        ) { entry in
            ComplicationEntryView(entry: entry)
        }
        .configurationDisplayName("System Status")
        .description("Shows Mission Control status")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular])
    }
}
```

## Part 4: Push Notifications

### 4.1 Configure APNs

1. Apple Developer Portal → Certificates → Create APNs Key
2. Download key file (.p8)
3. Note Key ID and Team ID

### 4.2 Hub Notification Service

Add to Hub:

```typescript
// packages/hub/src/services/notifications.ts
import apn from "@parse/node-apn";

const apnProvider = new apn.Provider({
  token: {
    key: process.env.APN_KEY_PATH,
    keyId: process.env.APN_KEY_ID,
    teamId: process.env.APN_TEAM_ID,
  },
  production: true,
});

export async function sendNotification(
  deviceToken: string,
  title: string,
  body: string
) {
  const notification = new apn.Notification({
    alert: { title, body },
    topic: "com.yourdomain.mission-control",
    sound: "default",
  });

  await apnProvider.send(notification, deviceToken);
}
```

### 4.3 iOS Notification Handling

```swift
// Services/NotificationService.swift
import UserNotifications

class NotificationService: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationService()

    func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        do {
            return try await center.requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            return false
        }
    }

    func registerForRemoteNotifications() {
        UIApplication.shared.registerForRemoteNotifications()
    }

    func handleDeviceToken(_ token: Data) {
        let tokenString = token.map { String(format: "%02.2hhx", $0) }.joined()
        // Send to Hub
        Task {
            try? await APIClient().registerDevice(token: tokenString)
        }
    }
}
```

## Part 5: Build & Deploy

### 5.1 Configure Signing

1. Select project in Xcode
2. Signing & Capabilities
3. Select your team
4. Enable: Push Notifications, Network Extensions

### 5.2 Build for Device

```bash
# Archive
xcodebuild -scheme "Mission Control" -sdk iphoneos archive

# Or use Xcode: Product → Archive
```

### 5.3 TestFlight Distribution

1. Upload archive to App Store Connect
2. Add testers to TestFlight
3. Distribute via TestFlight link

## Verification Checklist

- [ ] iOS app builds successfully
- [ ] watchOS app builds successfully
- [ ] Can connect to Hub via Tailscale
- [ ] Chat functionality works
- [ ] Status view shows nodes
- [ ] Push notifications received
- [ ] Watch complications display
- [ ] App handles offline gracefully

## Troubleshooting

### Can't connect to Hub
- Verify Tailscale VPN is active on iOS
- Check Hub is accessible: `ping 100.x.x.x`

### Push notifications not working
- Verify APNs configuration
- Check device token registered
- Test with APNs sandbox first

### Watch not syncing
- Check WatchConnectivity session
- Verify both apps are foreground

## Next Steps

With all phases complete, you have a fully operational Mission Control system:

1. Review [Security Checklist](../security/audit-logging.md)
2. Set up monitoring dashboards
3. Document operational procedures
4. Train users on the system
