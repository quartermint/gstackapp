//
//  StatusGlanceView.swift
//  MissionControlWatch
//
//  Glanceable status view showing system health at a glance.
//

import SwiftUI

struct StatusGlanceView: View {
    @EnvironmentObject var systemStatus: SystemStatusViewModel
    @EnvironmentObject var connectivityService: WatchConnectivityService

    @State private var isRefreshing: Bool = false

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Main status icon
                statusIcon
                    .padding(.top, 8)

                // Status text
                statusText

                // Node count
                if systemStatus.status.isHealthy {
                    nodeCountView
                }

                // Last updated
                lastUpdatedView

                // Error message if present
                if let error = systemStatus.lastError {
                    errorView(error)
                }

                // Refresh button
                refreshButton
            }
            .padding(.horizontal, 8)
        }
    }

    // MARK: - Subviews

    private var statusIcon: some View {
        ZStack {
            Circle()
                .fill(statusBackgroundColor.opacity(0.2))
                .frame(width: 60, height: 60)

            Image(systemName: statusIconName)
                .font(.system(size: 32, weight: .medium))
                .foregroundColor(statusIconColor)
        }
    }

    private var statusText: some View {
        VStack(spacing: 4) {
            Text(statusTitle)
                .font(.headline)
                .foregroundColor(.primary)
                .multilineTextAlignment(.center)

            if systemStatus.status.activeTaskCount > 0 {
                Text("\(systemStatus.status.activeTaskCount) active tasks")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
    }

    private var nodeCountView: some View {
        HStack(spacing: 4) {
            Image(systemName: "server.rack")
                .font(.caption2)
                .foregroundColor(.secondary)

            Text("\(systemStatus.status.nodeCount) nodes online")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private var lastUpdatedView: some View {
        Group {
            if let lastUpdated = systemStatus.status.lastUpdated {
                Text("Updated \(lastUpdated, style: .relative) ago")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
    }

    private func errorView(_ error: String) -> some View {
        Text(error)
            .font(.caption2)
            .foregroundColor(.red)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 8)
    }

    private var refreshButton: some View {
        Button(action: refresh) {
            HStack(spacing: 4) {
                if isRefreshing || systemStatus.isLoading {
                    ProgressView()
                        .scaleEffect(0.7)
                } else {
                    Image(systemName: "arrow.clockwise")
                        .font(.caption2)
                }
                Text("Refresh")
                    .font(.caption2)
            }
        }
        .buttonStyle(.bordered)
        .tint(.blue)
        .disabled(isRefreshing || systemStatus.isLoading)
        .padding(.top, 4)
    }

    // MARK: - Computed Properties

    private var statusIconName: String {
        if !connectivityService.isReachable {
            return "wifi.slash"
        }
        return systemStatus.status.isHealthy ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
    }

    private var statusIconColor: Color {
        if !connectivityService.isReachable {
            return .gray
        }
        return systemStatus.status.isHealthy ? .green : .orange
    }

    private var statusBackgroundColor: Color {
        if !connectivityService.isReachable {
            return .gray
        }
        return systemStatus.status.isHealthy ? .green : .orange
    }

    private var statusTitle: String {
        if !connectivityService.isReachable {
            return "Disconnected"
        }
        return systemStatus.status.isHealthy ? "All Systems Go" : "Issues Detected"
    }

    // MARK: - Actions

    private func refresh() {
        isRefreshing = true
        connectivityService.requestStatusUpdate()

        // Reset refresh state after a timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            isRefreshing = false
        }
    }
}

#Preview {
    StatusGlanceView()
        .environmentObject(WatchConnectivityService())
        .environmentObject(SystemStatusViewModel())
}
