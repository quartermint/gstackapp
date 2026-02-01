# Mission Control iOS App

Native iOS application for the Mission Control orchestration system.

## Features

- Real-time chat interface with Claude
- System status monitoring with node health indicators
- Task list with filtering and search
- Push notifications for task completion and system alerts
- Secure authentication with JWT tokens stored in Keychain
- Dark mode support
- Offline-friendly UI

## Requirements

- Xcode 15+
- iOS 17+
- Apple Developer account (for device deployment)
- Tailscale iOS app (for Hub connectivity)

## Project Structure

```
MissionControl/
├── MissionControl.xcodeproj/
│   └── project.pbxproj
├── MissionControl/
│   ├── MissionControlApp.swift     # App entry point
│   ├── Info.plist                  # App configuration
│   ├── Models/
│   │   ├── Message.swift           # Chat message model
│   │   ├── Task.swift              # Task model
│   │   ├── Node.swift              # Compute node model
│   │   └── Conversation.swift      # Conversation model
│   ├── Services/
│   │   ├── APIClient.swift         # Hub API client
│   │   ├── AuthService.swift       # JWT authentication
│   │   ├── NotificationService.swift # Push notifications
│   │   └── KeychainService.swift   # Secure token storage
│   ├── ViewModels/
│   │   ├── ChatViewModel.swift     # Chat state management
│   │   ├── StatusViewModel.swift   # Status monitoring
│   │   └── TasksViewModel.swift    # Task list management
│   ├── Views/
│   │   ├── ContentView.swift       # Main tab view
│   │   ├── ChatView.swift          # Chat interface
│   │   ├── StatusView.swift        # System status
│   │   ├── TasksView.swift         # Task list
│   │   └── SettingsView.swift      # App settings
│   └── Resources/
│       └── Assets.xcassets/        # App assets
└── README.md
```

## Building

### Open in Xcode

```bash
cd apps/ios/MissionControl
open MissionControl.xcodeproj
```

### Build from Command Line

```bash
# Build for simulator
xcodebuild -scheme "MissionControl" \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  build

# Build for device (requires signing)
xcodebuild -scheme "MissionControl" \
  -sdk iphoneos \
  -configuration Release \
  build
```

## Configuration

### Hub Connection

The app connects to the Mission Control Hub via Tailscale VPN. Configure the Hub URL in Settings:

1. Install Tailscale on your iOS device
2. Sign in with the same Tailscale account as other nodes
3. Open Mission Control app
4. Go to Settings > Server
5. Enter your Hub's Tailscale IP (e.g., `http://100.64.0.1:3000`)
6. Tap "Test" to verify connection

### Push Notifications

To receive push notifications:

1. Enable notifications in Settings > Notifications
2. Configure APNs on the Hub server
3. The app will automatically register your device token

## Development

### Architecture

- **SwiftUI** for all views
- **Combine** for reactive updates
- **async/await** for networking
- **Keychain Services** for secure storage

### View Models

Views are connected to ObservableObject view models that handle:
- API communication
- State management
- Error handling
- Auto-refresh timers

### API Client

The `APIClient` class provides typed methods for all Hub endpoints:

```swift
// Chat
let response = try await apiClient.chat(message: "Hello")

// Nodes
let nodes = try await apiClient.getNodes()

// Tasks
let tasks = try await apiClient.getTasks(status: .running)

// Authentication
let auth = try await apiClient.login(username: "user", password: "pass")
```

## Hub API Endpoints

The app interacts with these Hub endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /chat | Send chat message |
| GET | /conversations | List conversations |
| GET | /conversations/:id/messages | Get conversation messages |
| GET | /admin/nodes | Get node status |
| GET | /tasks | List tasks |
| GET | /tasks/:id | Get task details |
| POST | /auth/token | Login |
| POST | /auth/refresh | Refresh token |
| GET | /health | System health check |

## Security

- JWT tokens stored in iOS Keychain
- All network traffic over Tailscale VPN
- Automatic token refresh
- Secure token clearing on logout
- App Transport Security configured for Tailscale IPs

## Troubleshooting

### Cannot connect to Hub

1. Verify Tailscale VPN is connected
2. Check Hub URL in Settings
3. Ensure Hub is running and accessible
4. Test with `ping <tailscale-ip>` from another device

### Authentication errors

1. Check JWT secret matches Hub configuration
2. Try signing out and back in
3. Verify token has not expired

### Push notifications not working

1. Check notification permissions in iOS Settings
2. Verify APNs configuration on Hub
3. Check device token was registered successfully
4. Test with APNs sandbox first

## License

See the main project LICENSE file.
