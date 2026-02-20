import SwiftUI

/// Priority level for task dispatch
enum TaskPriority: Int, CaseIterable, Identifiable {
    case low = 25
    case normal = 50
    case high = 75
    case critical = 100

    var id: Int { rawValue }

    var displayName: String {
        switch self {
        case .low: return "Low"
        case .normal: return "Normal"
        case .high: return "High"
        case .critical: return "Critical"
        }
    }

    var color: Color {
        switch self {
        case .low: return .gray
        case .normal: return .blue
        case .high: return .orange
        case .critical: return .red
        }
    }
}

/// Sheet for dispatching a new task to the cluster
struct TaskDispatchView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var command = ""
    @State private var priority: TaskPriority = .normal
    @State private var timeoutSeconds = 30
    @State private var isSubmitting = false
    @State private var error: Error?
    @State private var didSucceed = false

    /// Callback to refresh the task list after dispatch
    var onDispatched: (() async -> Void)?

    private let timeoutOptions = [10, 30, 60, 120, 300, 600]

    var body: some View {
        NavigationStack {
            Form {
                // Command input
                Section {
                    TextEditor(text: $command)
                        .font(.system(.body, design: .monospaced))
                        .frame(minHeight: 100)
                        .scrollContentBackground(.hidden)
                } header: {
                    Text("Command")
                } footer: {
                    Text("Enter the command to execute on a compute node.")
                }

                // Priority picker
                Section {
                    Picker("Priority", selection: $priority) {
                        ForEach(TaskPriority.allCases) { p in
                            HStack {
                                Circle()
                                    .fill(p.color)
                                    .frame(width: 8, height: 8)
                                Text("\(p.displayName) (\(p.rawValue))")
                            }
                            .tag(p)
                        }
                    }
                } header: {
                    Text("Priority")
                }

                // Timeout picker
                Section {
                    Picker("Timeout", selection: $timeoutSeconds) {
                        ForEach(timeoutOptions, id: \.self) { seconds in
                            Text(formatTimeout(seconds)).tag(seconds)
                        }
                    }
                } header: {
                    Text("Timeout")
                } footer: {
                    Text("Maximum time for the task to complete before being terminated.")
                }

                // Error display
                if let error {
                    Section {
                        Text(error.localizedDescription)
                            .foregroundStyle(.red)
                    }
                }

                // Submit button
                Section {
                    Button {
                        Task { await dispatchTask() }
                    } label: {
                        HStack {
                            Spacer()
                            if isSubmitting {
                                ProgressView()
                            } else {
                                Label("Dispatch Task", systemImage: "paperplane.fill")
                            }
                            Spacer()
                        }
                    }
                    .disabled(command.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
                }
            }
            .navigationTitle("Dispatch Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func dispatchTask() async {
        let trimmedCommand = command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedCommand.isEmpty else { return }

        isSubmitting = true
        error = nil

        do {
            _ = try await APIClient.shared.dispatchTask(
                command: trimmedCommand,
                priority: priority.rawValue,
                timeoutMs: timeoutSeconds * 1000
            )

            HapticService.taskDispatched()
            didSucceed = true

            // Refresh task list and dismiss
            if let onDispatched {
                await onDispatched()
            }

            dismiss()
        } catch {
            self.error = error
            HapticService.error()
        }

        isSubmitting = false
    }

    private func formatTimeout(_ seconds: Int) -> String {
        if seconds < 60 {
            return "\(seconds)s"
        } else {
            return "\(seconds / 60)m"
        }
    }
}

// MARK: - Preview

#Preview {
    TaskDispatchView()
}
