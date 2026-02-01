# iOS App

The Mission Control iOS app provides mobile access to the orchestration system.

## Overview

Features:
- Real-time system monitoring
- Chat interface with Claude
- Task status and notifications
- Quick actions

## Requirements

- Xcode 15+
- iOS 17+
- Apple Developer account
- Tailscale iOS app (for Hub connectivity)

## Project Setup

### 1. Open in Xcode

```bash
cd apps/ios
open MissionControl.xcodeproj
```

### 2. Configure Signing

1. Select project in navigator
2. Signing & Capabilities
3. Select your Team
4. Update Bundle ID if needed

### 3. Configure Capabilities

Enable in Signing & Capabilities:
- Push Notifications
- Background Modes → Remote notifications
- Network Extensions (if using VPN features)

## Architecture

```
MissionControl/
├── MissionControlApp.swift     # App entry point
├── Views/
│   ├── ContentView.swift       # Main tab view
│   ├── ChatView.swift          # Chat interface
│   ├── StatusView.swift        # System status
│   ├── TasksView.swift         # Task list
│   └── SettingsView.swift      # Settings
├── Models/
│   ├── Message.swift           # Chat message model
│   ├── Task.swift              # Task model
│   └── Node.swift              # Node model
├── Services/
│   ├── APIClient.swift         # Hub API client
│   ├── AuthService.swift       # Authentication
│   └── NotificationService.swift
├── ViewModels/
│   ├── ChatViewModel.swift
│   └── StatusViewModel.swift
└── Resources/
    └── Assets.xcassets
```

## Configuration

### Hub Connection

Configure in Settings or via environment:

```swift
// Default to Tailscale IP
let hubURL = URL(string: "http://100.x.x.x:3000")!
```

### Authentication

The app uses JWT tokens stored in Keychain:

```swift
let token = try KeychainService.getToken()
apiClient.setAuthToken(token)
```

## Features

### Chat

- Full conversation history
- Markdown rendering
- Code syntax highlighting
- Voice input (optional)

### Status Dashboard

- Node health indicators
- Active task count
- System load metrics
- Connection status

### Tasks

- View pending/running/completed tasks
- Task details and logs
- Cancel running tasks

### Notifications

- Task completion alerts
- Error notifications
- System health warnings

## Development

### Run on Simulator

1. Select iOS Simulator target
2. Cmd+R to build and run

### Run on Device

1. Connect device
2. Select device as target
3. Cmd+R to build and run

### Testing

```bash
# Run unit tests
Cmd+U in Xcode

# Run UI tests
Select UI test scheme, Cmd+U
```

## Dependencies

Using Swift Package Manager:

```swift
dependencies: [
    .package(url: "https://github.com/apple/swift-markdown", from: "0.2.0"),
    .package(url: "https://github.com/auth0/JWTDecode.swift", from: "3.0.0"),
]
```

## Building for Release

### TestFlight

1. Product → Archive
2. Distribute App → TestFlight
3. Upload to App Store Connect
4. Add testers in TestFlight

### App Store

1. Product → Archive
2. Distribute App → App Store Connect
3. Submit for review

## Tailscale Integration

The app requires Tailscale VPN to connect to the Hub:

1. Install Tailscale from App Store
2. Sign in with same account as other nodes
3. Enable VPN before using Mission Control

For direct Tailscale SDK integration (optional):
```swift
import Tailscale

let client = TailscaleClient()
try await client.connect()
```

## Troubleshooting

### Can't connect to Hub

1. Verify Tailscale VPN is connected
2. Check Hub URL in Settings
3. Test: `ping 100.x.x.x` from another device

### Push notifications not working

1. Check notification permissions
2. Verify APNs configuration
3. Check Hub notification service

### Authentication errors

1. Try signing out and back in
2. Check token expiration
3. Verify Hub JWT secret matches

## Privacy

The app:
- Stores auth tokens in Keychain
- Does not track user analytics
- Communicates only with your Hub
- Requires VPN for all connections
