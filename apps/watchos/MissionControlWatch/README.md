# Mission Control Watch

The Mission Control watchOS companion app provides glanceable system status, quick commands, and complications for Apple Watch.

## Overview

This watchOS app is designed for quick interactions with Mission Control, allowing you to:

- View system health at a glance
- Send pre-defined quick commands
- Monitor node and task status via complications
- Receive notifications from the Hub

## Requirements

- Xcode 15+
- watchOS 10.0+
- Apple Watch Series 6 or later
- Paired iPhone with iOS companion app installed

## Project Structure

```
MissionControlWatch/
├── MissionControlWatch.xcodeproj/
│   └── project.pbxproj
├── MissionControlWatch/
│   ├── MissionControlWatchApp.swift    # App entry point
│   ├── Info.plist                       # App configuration
│   ├── ContentView.swift                # Main tab view
│   ├── StatusGlanceView.swift           # Status at a glance
│   ├── QuickChatView.swift              # Quick command buttons
│   ├── Models/
│   │   └── SystemStatus.swift           # Status data model
│   ├── Services/
│   │   └── WatchConnectivityService.swift  # iPhone communication
│   ├── Complications/
│   │   ├── ComplicationViews.swift      # Complication visual templates
│   │   └── StatusComplication.swift     # WidgetKit configuration
│   └── Assets.xcassets/                 # App icons and colors
└── README.md
```

## Features

### Status Glance

The main view shows:
- Large status icon (checkmark for healthy, warning for issues)
- Connection status text
- Number of online nodes
- Number of active tasks
- Last update timestamp
- Manual refresh button

### Quick Chat Commands

Pre-defined commands for fast interactions:
- **Status** - Request a system status report
- **Errors** - Check for any current errors
- **Tasks** - List active tasks

Commands are sent via WatchConnectivity to the iOS app, which forwards them to the Hub.

### Complications

Four complication families are supported:

| Family | Description |
|--------|-------------|
| `accessoryCircular` | Status icon in a ring |
| `accessoryRectangular` | Status icon + text + node count |
| `accessoryCorner` | Minimal status icon |
| `accessoryInline` | Text-based status |

## Quick Commands Flow

1. User taps a quick command button
2. `WatchConnectivityService` sends command to iOS app
3. iOS app forwards request to Hub via API
4. Response flows back through WatchConnectivity
5. Response displayed on watch

## Communication

### WatchConnectivity (Primary)

The app uses `WCSession` for real-time communication with the paired iPhone:

```swift
// Sending a command
connectivityService.sendChatCommand("Status report") { result in
    switch result {
    case .success(let response):
        // Display response
    case .failure(let error):
        // Handle error
    }
}

// Receiving status updates
connectivityService.onStatusUpdate = { status in
    systemStatus.update(from: status)
}
```

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `statusRequest` | Watch -> iPhone | Request current status |
| `statusUpdate` | iPhone -> Watch | Push status update |
| `chatCommand` | Watch -> iPhone | Send chat command |
| `chatResponse` | iPhone -> Watch | Return command response |

## Development

### Opening in Xcode

```bash
open MissionControlWatch.xcodeproj
```

### Run on Simulator

1. Open project in Xcode
2. Select a Watch Simulator target
3. Press Cmd+R to build and run

### Run on Device

1. Connect your iPhone with paired Watch
2. Select your Watch as the target
3. Build and run
4. The app will install on the Watch

## Configuration

### Bundle Identifiers

- Watch App: `com.mission-control.watchos`
- Companion iOS App: `com.mission-control.ios`

### App Groups

The app uses the group `group.com.mission-control.watch` for sharing data between:
- Main watch app
- Complication extension

### Entitlements

- `com.apple.security.application-groups` - For shared data
- `aps-environment` - For push notifications

## Complications Setup

### Adding to Watch Face

1. Long press on your watch face
2. Tap Edit
3. Select a complication slot
4. Scroll to find "Mission Control"
5. Tap to add

### Timeline Updates

Complications refresh every 15 minutes by default. Immediate updates occur when:
- Status changes significantly
- iPhone pushes a new status

```swift
// Force complication refresh
ComplicationController.shared.updateStatus(newStatus)
```

## Testing

### Simulator Testing

1. Run both iOS and watchOS simulators
2. Use Control+Shift+A in iOS simulator to control watch

### Device Testing

1. Install both iOS and watchOS apps
2. Ensure iPhone and Watch are paired
3. Test WatchConnectivity in foreground and background

## Building for Release

The watchOS app is bundled with the iOS app:

1. Archive the iOS project
2. Watch app is automatically included
3. Submit both together to App Store Connect

## Troubleshooting

### Watch not connecting to iPhone

1. Verify `WCSession.isSupported()` returns true
2. Check `session.isReachable` state
3. Ensure iOS app is running in foreground
4. Try restarting both devices

### Complications not updating

1. Verify the complication is on an active watch face
2. Check background refresh is enabled
3. Call `WidgetCenter.shared.reloadAllTimelines()`

### Quick commands timing out

1. Check iPhone reachability
2. Verify Hub is accessible from iOS app
3. Increase timeout if needed (default: 30s)

## Battery Optimization

To minimize battery usage:

- Status updates limited to every 15 minutes via complications
- Use WatchConnectivity instead of direct network calls
- Cache status in shared UserDefaults
- Avoid continuous polling

## Limitations

- No keyboard input (voice or pre-defined commands only)
- Dependent on iPhone for most operations
- Limited background execution time
- Small screen requires simplified UI

## Related Documentation

- [iOS App README](../../ios/README.md)
- [Phase 5 Mobile Guide](../../../docs/phases/phase-5-mobile.md)
- [WatchConnectivity Apple Docs](https://developer.apple.com/documentation/watchconnectivity)
- [WidgetKit for watchOS](https://developer.apple.com/documentation/widgetkit)
