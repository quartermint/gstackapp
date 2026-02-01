# watchOS App

The Mission Control watchOS companion app provides quick access from Apple Watch.

## Overview

Features:
- Glanceable system status
- Quick chat commands
- Task notifications
- Complications for watch faces

## Requirements

- Xcode 15+
- watchOS 10+
- Apple Watch Series 6 or later
- Paired iPhone with iOS app installed

## Project Setup

The watchOS app is included in the iOS project as a target:

1. Open `apps/ios/MissionControl.xcodeproj`
2. Select the watchOS target
3. Configure signing for watchOS

## Architecture

```
MissionControlWatch/
├── MissionControlWatchApp.swift    # App entry point
├── ContentView.swift               # Main view
├── Views/
│   ├── StatusGlanceView.swift      # Status at a glance
│   ├── QuickChatView.swift         # Pre-defined commands
│   └── TasksListView.swift         # Recent tasks
├── Complications/
│   ├── ComplicationController.swift
│   └── ComplicationViews.swift
└── Services/
    └── WatchConnectivity.swift     # iPhone communication
```

## Features

### Status Glance

Quick view showing:
- Overall system health (green/yellow/red)
- Node count
- Active tasks
- Last update time

### Quick Chat

Pre-defined commands for common queries:
- "Status report"
- "Any errors?"
- "List tasks"
- Custom commands (configurable)

### Complications

Available complication families:
- **Circular**: Health indicator icon
- **Rectangular**: Status text + icon
- **Corner**: Mini status indicator

## Communication

The watchOS app communicates via:

### 1. WatchConnectivity (Primary)

Sync with paired iPhone:

```swift
class PhoneConnector: NSObject, WCSessionDelegate {
    func sendMessage(_ message: [String: Any]) {
        WCSession.default.sendMessage(message, replyHandler: { reply in
            // Handle response
        })
    }
}
```

### 2. Direct API (When iPhone Unavailable)

If iPhone is not reachable and Watch has connectivity:

```swift
// Requires Watch to be on same Tailscale network
let response = try await URLSession.shared.data(from: hubURL)
```

## Development

### Run on Simulator

1. Select watchOS Simulator target
2. Cmd+R to build and run
3. Pair with iOS Simulator if needed

### Run on Device

1. Ensure Watch is paired with iPhone
2. Select Watch as target
3. Build and run

## Complications Setup

### ComplicationController.swift

```swift
class ComplicationController: NSObject, CLKComplicationDataSource {
    func getCurrentTimelineEntry(
        for complication: CLKComplication,
        withHandler handler: @escaping (CLKComplicationTimelineEntry?) -> Void
    ) {
        let template = createTemplate(for: complication.family)
        let entry = CLKComplicationTimelineEntry(
            date: Date(),
            complicationTemplate: template
        )
        handler(entry)
    }
}
```

### Widget Alternative (watchOS 10+)

Using WidgetKit for modern complications:

```swift
struct StatusWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: "com.mission-control.status",
            provider: StatusProvider()
        ) { entry in
            StatusWidgetView(entry: entry)
        }
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryCorner
        ])
    }
}
```

## Notifications

Watch receives notifications via:

1. **Mirrored from iPhone**: Standard push notifications
2. **Direct**: If configured with independent APNs

Handle notifications:

```swift
func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse
) {
    // Handle notification action
}
```

## Testing

### Unit Tests

```bash
# Select Watch test target
Cmd+U in Xcode
```

### UI Tests

Limited on watchOS - focus on iPhone UI tests.

## Building for Release

The watchOS app is included in the iOS app archive:

1. Archive the iOS app
2. Watch app is bundled automatically
3. Submit together to App Store

## Troubleshooting

### Watch not syncing

1. Check WatchConnectivity session state
2. Verify iPhone app is in foreground
3. Restart both apps

### Complications not updating

1. Check complication is on active watch face
2. Verify background refresh is enabled
3. Call `reloadTimeline()` when data changes

### High battery drain

1. Reduce update frequency
2. Use complications for passive updates
3. Minimize network requests

## Limitations

- Limited screen space for complex UI
- No keyboard input (voice or pre-defined only)
- Dependent on iPhone for full functionality
- Limited background execution time
