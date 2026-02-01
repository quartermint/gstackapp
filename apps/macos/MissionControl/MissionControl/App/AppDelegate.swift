//
//  AppDelegate.swift
//  MissionControl
//
//  NSApplicationDelegate for menu bar integration and popover management.
//

import SwiftUI
import AppKit

/// Application delegate for AppKit integration
class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusBarController: StatusBarController?
    private var quickChatPopover: QuickChatPopover?
    private var eventMonitor: Any?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Initialize status bar controller
        statusBarController = StatusBarController()

        // Initialize quick chat popover
        quickChatPopover = QuickChatPopover()

        // Register global keyboard shortcut
        registerGlobalShortcut()

        // Listen for quick chat notification
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleShowQuickChat),
            name: .showQuickChat,
            object: nil
        )

        // Setup event monitor for closing popover on outside click
        setupEventMonitor()
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Cleanup
        if let monitor = eventMonitor {
            NSEvent.removeMonitor(monitor)
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            // Show main window if no visible windows
            for window in sender.windows {
                if window.className.contains("SwiftUI") {
                    window.makeKeyAndOrderFront(self)
                    break
                }
            }
        }
        return true
    }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
        return true
    }

    // MARK: - Quick Chat

    @objc func handleShowQuickChat() {
        showQuickChat()
    }

    func showQuickChat() {
        guard let popover = quickChatPopover else { return }

        if popover.isShown {
            popover.close()
        } else {
            // Position popover in center-top of screen (Spotlight-style)
            if let screen = NSScreen.main {
                let screenFrame = screen.visibleFrame
                let popoverSize = CGSize(width: 600, height: 400)

                let originX = screenFrame.midX - popoverSize.width / 2
                let originY = screenFrame.maxY - popoverSize.height - 100

                let rect = CGRect(
                    x: originX,
                    y: originY,
                    width: popoverSize.width,
                    height: popoverSize.height
                )

                popover.show(at: rect)
            }
        }
    }

    // MARK: - Global Keyboard Shortcut

    private func registerGlobalShortcut() {
        // Register Cmd+Shift+M for quick chat
        NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.modifierFlags.contains([.command, .shift]) && event.keyCode == 46 { // 46 = M
                DispatchQueue.main.async {
                    self?.showQuickChat()
                }
            }
        }
    }

    // MARK: - Event Monitor

    private func setupEventMonitor() {
        eventMonitor = NSEvent.addGlobalMonitorForEvents(
            matching: [.leftMouseDown, .rightMouseDown]
        ) { [weak self] _ in
            if let popover = self?.quickChatPopover, popover.isShown {
                popover.close()
            }
        }
    }
}

// MARK: - Dock Icon Management

extension AppDelegate {
    func setDockIconVisible(_ visible: Bool) {
        if visible {
            NSApp.setActivationPolicy(.regular)
        } else {
            NSApp.setActivationPolicy(.accessory)
        }
    }
}

// MARK: - Window Management

extension AppDelegate {
    func bringToFront() {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)

        for window in NSApp.windows {
            if !window.title.isEmpty {
                window.makeKeyAndOrderFront(nil)
                break
            }
        }
    }
}
