//
//  MainView.swift
//  MissionControl
//
//  Main application view with sidebar navigation.
//

import SwiftUI

/// Navigation sections for sidebar
enum NavigationSection: String, CaseIterable, Identifiable {
    case chat = "Chat"
    case status = "Status"
    case tasks = "Tasks"
    case settings = "Settings"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .chat: return "bubble.left.and.bubble.right"
        case .status: return "chart.bar"
        case .tasks: return "checklist"
        case .settings: return "gear"
        }
    }

    var keyboardShortcut: KeyEquivalent {
        switch self {
        case .chat: return "1"
        case .status: return "2"
        case .tasks: return "3"
        case .settings: return "4"
        }
    }
}

/// Main application view with NavigationSplitView
struct MainView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedSection: NavigationSection? = .chat
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            // Sidebar
            List(selection: $selectedSection) {
                ForEach(NavigationSection.allCases) { section in
                    NavigationLink(value: section) {
                        Label(section.rawValue, systemImage: section.icon)
                    }
                    .keyboardShortcut(section.keyboardShortcut, modifiers: .command)
                }
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 180, ideal: 200, max: 250)
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    ConnectionStatusIndicator()
                }
            }
        } detail: {
            // Detail view based on selection
            Group {
                switch selectedSection {
                case .chat:
                    ChatView()
                case .status:
                    StatusView()
                case .tasks:
                    TasksView()
                case .settings:
                    SettingsView()
                case .none:
                    Text("Select a section")
                        .foregroundColor(.secondary)
                }
            }
            .frame(minWidth: 600, minHeight: 400)
        }
        .navigationTitle(selectedSection?.rawValue ?? "Mission Control")
        .frame(minWidth: 800, minHeight: 500)
    }
}

/// Connection status indicator for toolbar
struct ConnectionStatusIndicator: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(appState.connectionStatus.color)
                .frame(width: 8, height: 8)

            Text(appState.connectionStatus.description)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.secondary.opacity(0.1))
        )
        .help("Connection status: \(appState.connectionStatus.description)")
    }
}

// MARK: - Preview

#Preview {
    MainView()
        .environmentObject(AppState())
}
