# Mission Control macOS Client

A dual-purpose native macOS application that serves as both a user client and compute contributor for the Mission Control AI orchestration system.

## Features

### User Client Mode
- **Full Chat Interface**: Conversation list, message history with Markdown rendering
- **Task Browser**: View, create, and manage tasks with filtering
- **Node Status Dashboard**: Monitor system health and node metrics
- **Menu Bar Integration**: Quick access via status bar icon
- **Spotlight-style Quick Chat**: Global keyboard shortcut (Cmd+Shift+M)

### Compute Contributor Mode
- **Idle Compute Contribution**: Contribute your Mac's resources to process tasks
- **Sandboxed Execution**: All tasks run in isolated environments
- **Command Allowlist**: Only pre-approved commands can execute
- **Resource Limits**: Configurable CPU, memory, and concurrent task limits

## Requirements

- macOS 14.0 (Sonoma) or later
- Xcode 15.0 or later (for building)
- Swift 5.9 or later

## Building

```bash
cd apps/macos/MissionControl
xcodebuild -scheme "MissionControl" -sdk macosx build
```

Or open `MissionControl.xcodeproj` in Xcode and build (Cmd+B).

## Architecture

```
MissionControl/
├── App/
│   ├── MissionControlApp.swift     # Main app entry, dual-mode detection
│   └── AppDelegate.swift           # Menu bar and popover management
├── Views/
│   ├── MainView.swift              # Sidebar navigation
│   ├── ChatView.swift              # Conversation interface
│   ├── StatusView.swift            # Node health dashboard
│   ├── TasksView.swift             # Task queue browser
│   └── SettingsView.swift          # Preferences
├── Services/
│   ├── APIClient.swift             # Hub communication
│   ├── ComputeService.swift        # Task polling/submission
│   └── KeychainService.swift       # Secure credential storage
├── MenuBar/
│   ├── StatusBarController.swift   # Status item management
│   └── QuickChatPopover.swift      # Spotlight-style chat
└── ComputeMode/
    ├── ComputeManager.swift        # Compute orchestration
    ├── SandboxExecutor.swift       # Isolated task execution
    └── TaskReceiver.swift          # Task assignment
```

## Application Modes

### Client Only (Default)
Use Mission Control as a chat client without contributing compute resources.

### Compute Contributor
Your Mac contributes idle compute resources to process tasks from the Hub. Tasks are executed in a sandboxed environment with strict security controls.

### Hybrid
Both client and compute contributor modes active simultaneously.

## Security

### Compute Mode Security
1. **Trusted Hub Only**: Tasks are only accepted from authenticated Hub connections
2. **Command Allowlist**: Only pre-approved commands can execute (git, npm, node, etc.)
3. **Sandbox Isolation**: Each task runs in an isolated temporary directory
4. **Blocked Patterns**: Dangerous command patterns are detected and rejected
5. **Resource Limits**: CPU, memory, and timeout limits are enforced
6. **User Approval**: Compute mode requires explicit user opt-in

### Allowed Commands
- Git: `git`
- Package managers: `npm`, `pnpm`, `yarn`, `npx`
- File operations (read): `ls`, `cat`, `head`, `tail`, `find`, `grep`, `wc`
- Development: `node`, `python3`, `python`
- Build tools: `make`, `cargo`, `go`
- Utilities: `echo`, `date`, `pwd`, `which`, `env`

### Blocked Patterns
- `rm -rf /`, `rm -rf ~`
- `sudo`, `chmod 777`
- `curl | sh`, `wget | sh`
- Access to sensitive paths (`/etc/passwd`, `~/.ssh`, etc.)
- Fork bombs and other malicious patterns

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+N | New Conversation |
| Cmd+Shift+M | Quick Chat (global) |
| Cmd+1 | Chat View |
| Cmd+2 | Status View |
| Cmd+3 | Tasks View |
| Cmd+4 | Settings View |
| Cmd+, | Open Settings |
| Cmd+Q | Quit |

## Configuration

### Connection Settings
- Hub URL: The Mission Control Hub endpoint
- API Timeout: Request timeout in seconds
- Authentication token (stored in Keychain)

### Compute Settings
- Max CPU Usage: Percentage limit
- Max Memory: MB limit
- Max Concurrent Tasks: Number of simultaneous tasks
- Task Timeout: Maximum execution time per task
- Idle Time: Minutes of idle before contributing compute

### Notification Settings
- New message notifications
- Task completion/failure alerts
- Disconnection warnings
- Sound preferences

## Trust Model

The macOS client operates with `power-user` trust level:
- Full chat capabilities
- Can create and manage tasks
- Can contribute compute resources
- Cannot access admin functions

## Menu Bar

The app includes a menu bar status item that:
- Shows connection status with colored indicator
- Provides quick access to main window
- Shows compute mode status (if enabled)
- Allows quick settings access

Click the menu bar icon for the dropdown menu, or use the keyboard shortcut for quick chat.

## License

Copyright 2024 Mission Control Team. All rights reserved.
