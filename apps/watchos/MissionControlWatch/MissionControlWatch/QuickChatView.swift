//
//  QuickChatView.swift
//  MissionControlWatch
//
//  Quick command interface for sending pre-defined commands to the Hub.
//

import SwiftUI

struct QuickChatView: View {
    @EnvironmentObject var connectivityService: WatchConnectivityService
    @EnvironmentObject var systemStatus: SystemStatusViewModel

    @State private var lastResponse: String?
    @State private var isLoading: Bool = false
    @State private var activeCommand: String?
    @State private var showingResponse: Bool = false

    /// Pre-defined quick commands for common queries
    private let quickCommands: [QuickCommand] = [
        QuickCommand(label: "Status", command: "Status report", icon: "chart.bar.fill"),
        QuickCommand(label: "Errors", command: "Any errors?", icon: "exclamationmark.triangle.fill"),
        QuickCommand(label: "Tasks", command: "List tasks", icon: "checklist")
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    // Header
                    headerView

                    // Quick command buttons
                    ForEach(quickCommands) { command in
                        quickCommandButton(command)
                    }

                    // Response area
                    if showingResponse {
                        responseView
                    }
                }
                .padding(.horizontal, 8)
            }
            .navigationTitle("Quick Chat")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Subviews

    private var headerView: some View {
        Text("Tap a command")
            .font(.caption2)
            .foregroundColor(.secondary)
            .padding(.top, 4)
    }

    private func quickCommandButton(_ command: QuickCommand) -> some View {
        Button(action: {
            sendCommand(command)
        }) {
            HStack(spacing: 8) {
                Image(systemName: command.icon)
                    .font(.caption)
                    .frame(width: 16)

                Text(command.label)
                    .font(.caption)
                    .lineLimit(1)

                Spacer()

                if isLoading && activeCommand == command.command {
                    ProgressView()
                        .scaleEffect(0.6)
                }
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .background(buttonBackground(for: command))
            .cornerRadius(8)
        }
        .buttonStyle(.plain)
        .disabled(isLoading || !connectivityService.isReachable)
        .opacity(connectivityService.isReachable ? 1.0 : 0.5)
    }

    private func buttonBackground(for command: QuickCommand) -> some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(activeCommand == command.command ? Color.blue.opacity(0.3) : Color.gray.opacity(0.2))
    }

    private var responseView: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Response")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundColor(.secondary)

                Spacer()

                Button(action: clearResponse) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }

            if let response = lastResponse {
                ScrollView {
                    Text(response)
                        .font(.caption2)
                        .foregroundColor(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 100)
            } else if isLoading {
                HStack {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Processing...")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(8)
        .background(Color.gray.opacity(0.1))
        .cornerRadius(8)
    }

    // MARK: - Actions

    private func sendCommand(_ command: QuickCommand) {
        guard connectivityService.isReachable else {
            lastResponse = "iPhone not reachable"
            showingResponse = true
            return
        }

        isLoading = true
        activeCommand = command.command
        lastResponse = nil
        showingResponse = true

        connectivityService.sendChatCommand(command.command) { result in
            DispatchQueue.main.async {
                self.isLoading = false

                switch result {
                case .success(let response):
                    self.lastResponse = response
                case .failure(let error):
                    self.lastResponse = "Error: \(error.localizedDescription)"
                }
            }
        }
    }

    private func clearResponse() {
        withAnimation {
            showingResponse = false
            lastResponse = nil
            activeCommand = nil
        }
    }
}

// MARK: - Supporting Types

struct QuickCommand: Identifiable {
    let id = UUID()
    let label: String
    let command: String
    let icon: String
}

#Preview {
    QuickChatView()
        .environmentObject(WatchConnectivityService())
        .environmentObject(SystemStatusViewModel())
}
