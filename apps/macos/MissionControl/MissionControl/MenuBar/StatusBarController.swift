//
//  StatusBarController.swift
//  MissionControl
//
//  NSStatusItem management for menu bar integration.
//

import AppKit
import SwiftUI

/// Controller for the status bar item
class StatusBarController: NSObject {
    private var statusItem: NSStatusItem?
    private var popover: NSPopover?
    private var statusMenu: NSMenu?

    // Current status
    private var connectionStatus: ConnectionStatus = .disconnected
    private var activeTasks: Int = 0

    override init() {
        super.init()
        setupStatusItem()
        setupObservers()
    }

    // MARK: - Setup

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "antenna.radiowaves.left.and.right", accessibilityDescription: "Mission Control")
            button.action = #selector(statusItemClicked(_:))
            button.target = self
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }

        buildMenu()
    }

    private func setupObservers() {
        // Listen for status updates
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(connectionStatusChanged(_:)),
            name: NSNotification.Name("ConnectionStatusChanged"),
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(computeStatusChanged(_:)),
            name: NSNotification.Name("ComputeStatusChanged"),
            object: nil
        )
    }

    // MARK: - Menu

    private func buildMenu() {
        statusMenu = NSMenu()

        // Status header
        let statusItem = NSMenuItem(title: "Status: \(connectionStatus.description)", action: nil, keyEquivalent: "")
        statusItem.isEnabled = false
        statusMenu?.addItem(statusItem)

        if activeTasks > 0 {
            let tasksItem = NSMenuItem(title: "Active Tasks: \(activeTasks)", action: nil, keyEquivalent: "")
            tasksItem.isEnabled = false
            statusMenu?.addItem(tasksItem)
        }

        statusMenu?.addItem(NSMenuItem.separator())

        // Open main window
        let openItem = NSMenuItem(
            title: "Open Mission Control",
            action: #selector(openMainWindow),
            keyEquivalent: "o"
        )
        openItem.target = self
        openItem.keyEquivalentModifierMask = .command
        statusMenu?.addItem(openItem)

        // Quick chat
        let chatItem = NSMenuItem(
            title: "Quick Chat...",
            action: #selector(showQuickChat),
            keyEquivalent: "m"
        )
        chatItem.target = self
        chatItem.keyEquivalentModifierMask = [.command, .shift]
        statusMenu?.addItem(chatItem)

        statusMenu?.addItem(NSMenuItem.separator())

        // Settings
        let settingsItem = NSMenuItem(
            title: "Settings...",
            action: #selector(openSettings),
            keyEquivalent: ","
        )
        settingsItem.target = self
        settingsItem.keyEquivalentModifierMask = .command
        statusMenu?.addItem(settingsItem)

        statusMenu?.addItem(NSMenuItem.separator())

        // Quit
        let quitItem = NSMenuItem(
            title: "Quit Mission Control",
            action: #selector(quitApp),
            keyEquivalent: "q"
        )
        quitItem.target = self
        quitItem.keyEquivalentModifierMask = .command
        statusMenu?.addItem(quitItem)
    }

    // MARK: - Actions

    @objc private func statusItemClicked(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent else { return }

        if event.type == .rightMouseUp {
            // Show menu on right click
            showMenu()
        } else {
            // Show popover on left click
            togglePopover()
        }
    }

    private func showMenu() {
        buildMenu() // Rebuild to update status
        statusItem?.menu = statusMenu
        statusItem?.button?.performClick(nil)
        statusItem?.menu = nil // Remove to allow popover on next click
    }

    private func togglePopover() {
        if let popover = popover, popover.isShown {
            popover.performClose(nil)
        } else {
            showPopover()
        }
    }

    private func showPopover() {
        guard let button = statusItem?.button else { return }

        if popover == nil {
            popover = NSPopover()
            popover?.contentSize = NSSize(width: 350, height: 300)
            popover?.behavior = .transient
            popover?.animates = true
            popover?.contentViewController = NSHostingController(
                rootView: StatusBarPopoverView()
            )
        }

        popover?.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
    }

    @objc private func openMainWindow() {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)

        for window in NSApp.windows {
            if !window.title.isEmpty && !window.title.contains("Settings") {
                window.makeKeyAndOrderFront(nil)
                return
            }
        }
    }

    @objc private func showQuickChat() {
        NotificationCenter.default.post(name: .showQuickChat, object: nil)
    }

    @objc private func openSettings() {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)

        // Open settings using SwiftUI Settings scene
        if #available(macOS 14.0, *) {
            NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
        } else {
            NSApp.sendAction(Selector(("showPreferencesWindow:")), to: nil, from: nil)
        }
    }

    @objc private func quitApp() {
        NSApplication.shared.terminate(nil)
    }

    // MARK: - Status Updates

    @objc private func connectionStatusChanged(_ notification: Notification) {
        if let status = notification.object as? ConnectionStatus {
            connectionStatus = status
            updateStatusIcon()
        }
    }

    @objc private func computeStatusChanged(_ notification: Notification) {
        if let count = notification.object as? Int {
            activeTasks = count
        }
    }

    private func updateStatusIcon() {
        let imageName: String
        switch connectionStatus {
        case .connected:
            imageName = "antenna.radiowaves.left.and.right"
        case .connecting:
            imageName = "antenna.radiowaves.left.and.right.slash"
        case .disconnected:
            imageName = "antenna.radiowaves.left.and.right.slash"
        case .error:
            imageName = "exclamationmark.triangle"
        }

        statusItem?.button?.image = NSImage(
            systemSymbolName: imageName,
            accessibilityDescription: "Mission Control - \(connectionStatus.description)"
        )
    }
}

/// SwiftUI view for status bar popover
struct StatusBarPopoverView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Image(systemName: "antenna.radiowaves.left.and.right.circle.fill")
                    .font(.title2)
                    .foregroundColor(.accentColor)
                Text("Mission Control")
                    .font(.headline)
                Spacer()
            }

            Divider()

            // Quick status
            VStack(alignment: .leading, spacing: 8) {
                StatusRow(label: "Connection", value: "Connected", color: .green)
                StatusRow(label: "Active Tasks", value: "0", color: .secondary)
                StatusRow(label: "Compute Mode", value: "Disabled", color: .secondary)
            }

            Divider()

            // Quick actions
            HStack(spacing: 12) {
                Button("Open App") {
                    openMainWindow()
                }
                .buttonStyle(.borderedProminent)

                Button("Quick Chat") {
                    NotificationCenter.default.post(name: .showQuickChat, object: nil)
                }
                .buttonStyle(.bordered)
            }

            Spacer()
        }
        .padding()
    }

    private func openMainWindow() {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)

        for window in NSApp.windows where !window.title.isEmpty {
            window.makeKeyAndOrderFront(nil)
            break
        }
    }
}

struct StatusRow: View {
    let label: String
    let value: String
    let color: Color

    var body: some View {
        HStack {
            Text(label)
                .foregroundColor(.secondary)
            Spacer()
            HStack(spacing: 4) {
                Circle()
                    .fill(color)
                    .frame(width: 6, height: 6)
                Text(value)
            }
        }
        .font(.caption)
    }
}
