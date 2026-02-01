import SwiftUI
import MissionControlNetworking

/// Main content view with tab navigation
struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab: Tab = .chat

    enum Tab: String, CaseIterable {
        case chat = "Chat"
        case status = "Status"
        case tasks = "Tasks"
        case settings = "Settings"

        var icon: String {
            switch self {
            case .chat: return "bubble.left.and.bubble.right"
            case .status: return "server.rack"
            case .tasks: return "list.bullet.rectangle"
            case .settings: return "gear"
            }
        }
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            ChatView()
                .tabItem {
                    Label(Tab.chat.rawValue, systemImage: Tab.chat.icon)
                }
                .tag(Tab.chat)

            StatusView()
                .tabItem {
                    Label(Tab.status.rawValue, systemImage: Tab.status.icon)
                }
                .tag(Tab.status)

            TasksView()
                .tabItem {
                    Label(Tab.tasks.rawValue, systemImage: Tab.tasks.icon)
                }
                .tag(Tab.tasks)
                .badge(appState.activeTaskCount > 0 ? appState.activeTaskCount : 0)

            SettingsView()
                .tabItem {
                    Label(Tab.settings.rawValue, systemImage: Tab.settings.icon)
                }
                .tag(Tab.settings)
        }
        .task {
            await appState.refresh()
        }
    }
}

// MARK: - Preview

#Preview {
    ContentView()
        .environmentObject(AppState())
}
