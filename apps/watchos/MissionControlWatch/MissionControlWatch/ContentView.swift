//
//  ContentView.swift
//  MissionControlWatch
//
//  Main content view with tab-based navigation between status and quick chat.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var connectivityService: WatchConnectivityService
    @EnvironmentObject var systemStatus: SystemStatusViewModel

    @State private var selectedTab: Int = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            StatusGlanceView()
                .tag(0)

            QuickChatView()
                .tag(1)
        }
        .tabViewStyle(.verticalPage)
        .onAppear {
            // Request initial status on appear
            connectivityService.requestStatusUpdate()
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(WatchConnectivityService())
        .environmentObject(SystemStatusViewModel())
}
