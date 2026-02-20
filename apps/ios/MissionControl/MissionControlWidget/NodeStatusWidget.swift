import WidgetKit
import SwiftUI

/// Timeline provider for the node status widget
struct NodeStatusProvider: TimelineProvider {
    private let sharedDefaults = UserDefaults(suiteName: "group.com.missioncontrol.ios")

    func placeholder(in context: Context) -> NodeStatusEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (NodeStatusEntry) -> Void) {
        if context.isPreview {
            completion(.placeholder)
            return
        }
        fetchStatus { entry in
            completion(entry)
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NodeStatusEntry>) -> Void) {
        fetchStatus { entry in
            // Refresh every 15 minutes
            let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
            let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
            completion(timeline)
        }
    }

    private func fetchStatus(completion: @escaping (NodeStatusEntry) -> Void) {
        guard let hubURL = sharedDefaults?.string(forKey: "hubURL"),
              let url = URL(string: "\(hubURL)/health") else {
            completion(.offline)
            return
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 10

        URLSession.shared.dataTask(with: request) { data, response, error in
            guard let data = data,
                  let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                completion(.offline)
                return
            }

            do {
                let decoder = JSONDecoder()
                let status = try decoder.decode(WidgetSystemStatus.self, from: data)

                let entry = NodeStatusEntry(
                    date: Date(),
                    isConnected: true,
                    onlineNodes: status.nodes.online,
                    totalNodes: status.nodes.total,
                    activeTasks: status.tasks?.active ?? 0,
                    health: status.nodes.online > 0 ? .healthy : .degraded
                )
                completion(entry)
            } catch {
                completion(.offline)
            }
        }.resume()
    }
}

/// Lightweight decodable for widget (avoids depending on full MissionControlNetworking)
private struct WidgetSystemStatus: Decodable {
    let nodes: WidgetNodeStats
    let tasks: WidgetTaskStats?

    struct WidgetNodeStats: Decodable {
        let total: Int
        let online: Int
    }

    struct WidgetTaskStats: Decodable {
        let active: Int?
    }
}

/// The node status widget definition
struct NodeStatusWidget: Widget {
    let kind = "NodeStatusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NodeStatusProvider()) { entry in
            NodeStatusWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Mission Control")
        .description("Monitor node status and active tasks.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
    }
}
