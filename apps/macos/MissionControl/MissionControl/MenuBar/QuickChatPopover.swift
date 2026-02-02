//
//  QuickChatPopover.swift
//  MissionControl
//
//  Spotlight-style quick chat interface accessible via global keyboard shortcut.
//

import AppKit
import SwiftUI

/// Quick chat popover window (Spotlight-style)
@MainActor
class QuickChatPopover: NSObject {
    private var window: NSPanel?
    private var hostingView: NSHostingView<QuickChatView>?
    private var viewModel = QuickChatViewModel()

    var isShown: Bool {
        window?.isVisible ?? false
    }

    override init() {
        super.init()
        setupWindow()
    }

    private func setupWindow() {
        // Create borderless window
        let window = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 600, height: 400),
            styleMask: [.borderless, .nonactivatingPanel, .hudWindow],
            backing: .buffered,
            defer: false
        )

        window.level = .floating
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.isMovableByWindowBackground = false
        window.hidesOnDeactivate = false

        // Create SwiftUI content
        let quickChatView = QuickChatView(viewModel: viewModel, onDismiss: { [weak self] in
            self?.close()
        })

        hostingView = NSHostingView(rootView: quickChatView)
        window.contentView = hostingView

        self.window = window
    }

    func show(at rect: CGRect) {
        window?.setFrame(rect, display: true)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        // Focus the text field
        viewModel.focus()
    }

    func close() {
        window?.orderOut(nil)
        viewModel.clear()
    }

    func toggle(at rect: CGRect) {
        if isShown {
            close()
        } else {
            show(at: rect)
        }
    }
}

/// View model for quick chat
@MainActor
class QuickChatViewModel: ObservableObject {
    @Published var inputText: String = ""
    @Published var response: String = ""
    @Published var isLoading: Bool = false
    @Published var isFocused: Bool = false
    @Published var recentResponses: [QuickChatResponse] = []

    private let apiClient = APIClient()

    struct QuickChatResponse: Identifiable {
        let id = UUID()
        let query: String
        let response: String
        let timestamp: Date
    }

    func submit() {
        guard !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard !isLoading else { return }

        let query = inputText
        inputText = ""
        isLoading = true

        Task {
            do {
                let chatResponse = try await apiClient.sendMessage(
                    conversationId: "quick-chat",
                    content: query
                )

                await MainActor.run {
                    response = chatResponse.content
                    recentResponses.insert(
                        QuickChatResponse(
                            query: query,
                            response: chatResponse.content,
                            timestamp: Date()
                        ),
                        at: 0
                    )
                    // Keep only last 5 responses
                    if recentResponses.count > 5 {
                        recentResponses = Array(recentResponses.prefix(5))
                    }
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    response = "Error: \(error.localizedDescription)"
                    isLoading = false
                }
            }
        }
    }

    func focus() {
        isFocused = true
    }

    func clear() {
        inputText = ""
        response = ""
        isLoading = false
    }
}

/// Quick chat SwiftUI view
struct QuickChatView: View {
    @ObservedObject var viewModel: QuickChatViewModel
    let onDismiss: () -> Void

    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Input area
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .font(.title2)
                    .foregroundColor(.secondary)

                TextField("Ask Claude...", text: $viewModel.inputText)
                    .textFieldStyle(.plain)
                    .font(.title3)
                    .focused($isInputFocused)
                    .onSubmit {
                        viewModel.submit()
                    }

                if viewModel.isLoading {
                    ProgressView()
                        .scaleEffect(0.8)
                }

                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.escape, modifiers: [])
            }
            .padding()

            Divider()

            // Response area
            if !viewModel.response.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        // Current response
                        ResponseCard(response: viewModel.response)
                    }
                    .padding()
                }
                .frame(maxHeight: 250)
            } else if !viewModel.recentResponses.isEmpty {
                // Recent responses
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Recent")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .padding(.horizontal)

                        ForEach(viewModel.recentResponses) { item in
                            RecentResponseRow(item: item)
                        }
                    }
                    .padding(.vertical)
                }
                .frame(maxHeight: 250)
            } else {
                // Empty state
                VStack(spacing: 8) {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.largeTitle)
                        .foregroundColor(.secondary)
                    Text("Type a message and press Return")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding()
            }

            // Keyboard shortcuts hint
            HStack {
                Text("Return to send")
                Spacer()
                Text("Esc to close")
            }
            .font(.caption2)
            .foregroundColor(.secondary)
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(Color(NSColor.windowBackgroundColor).opacity(0.5))
        }
        .frame(width: 600, height: 400)
        .background(
            VisualEffectView(material: .hudWindow, blendingMode: .behindWindow)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
        )
        .shadow(radius: 20)
        .onAppear {
            isInputFocused = true
        }
        .onChange(of: viewModel.isFocused) { _, newValue in
            if newValue {
                isInputFocused = true
                viewModel.isFocused = false
            }
        }
    }
}

/// Response card component
struct ResponseCard: View {
    let response: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "cpu")
                    .foregroundColor(.accentColor)
                Text("Claude")
                    .font(.caption)
                    .fontWeight(.medium)
                Spacer()

                Button(action: copyResponse) {
                    Image(systemName: "doc.on.doc")
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundColor(.secondary)
                .help("Copy to clipboard")
            }

            // Render markdown if possible
            if let attributedString = try? AttributedString(markdown: response) {
                Text(attributedString)
                    .textSelection(.enabled)
            } else {
                Text(response)
                    .textSelection(.enabled)
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.secondary.opacity(0.1))
        )
    }

    private func copyResponse() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(response, forType: .string)
    }
}

/// Recent response row
struct RecentResponseRow: View {
    let item: QuickChatViewModel.QuickChatResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.query)
                .font(.caption)
                .fontWeight(.medium)
                .lineLimit(1)

            Text(item.response)
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(2)

            Text(item.timestamp, style: .relative)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.secondary.opacity(0.05))
        )
        .padding(.horizontal)
    }
}

/// NSVisualEffectView wrapper for SwiftUI
struct VisualEffectView: NSViewRepresentable {
    let material: NSVisualEffectView.Material
    let blendingMode: NSVisualEffectView.BlendingMode

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = blendingMode
        view.state = .active
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = material
        nsView.blendingMode = blendingMode
    }
}
