//
//  MissionControlWatchApp.swift
//  MissionControlWatch
//
//  Main entry point for Mission Control watchOS companion app.
//

import SwiftUI

@main
struct MissionControlWatchApp: App {
    @StateObject private var connectivityService = WatchConnectivityService()
    @StateObject private var systemStatus = SystemStatusViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(connectivityService)
                .environmentObject(systemStatus)
                .onAppear {
                    connectivityService.activate()
                    connectivityService.onStatusUpdate = { status in
                        systemStatus.update(from: status)
                    }
                }
        }
    }
}

/// View model for managing system status across the app
@MainActor
class SystemStatusViewModel: ObservableObject {
    @Published var status: SystemStatus = SystemStatus.disconnected
    @Published var isLoading: Bool = false
    @Published var lastError: String?

    func update(from newStatus: SystemStatus) {
        self.status = newStatus
        self.lastError = nil
    }

    func setError(_ message: String) {
        self.lastError = message
    }

    func setLoading(_ loading: Bool) {
        self.isLoading = loading
    }
}
