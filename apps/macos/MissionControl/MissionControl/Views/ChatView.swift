//
//  ChatView.swift
//  MissionControl
//
//  Full conversation interface with conversation list and message history.
//

import SwiftUI

/// Main chat view with conversation list and message area
struct ChatView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedConversation: Conversation?
    @State private var messageInput: String = ""
    @State private var isLoading: Bool = false

    var body: some View {
        HSplitView {
            // Conversation list sidebar
            ConversationListView(
                conversations: appState.conversations,
                selectedConversation: $selectedConversation
            )
            .frame(minWidth: 200, maxWidth: 300)

            // Message area
            if let conversation = selectedConversation {
                ConversationDetailView(
                    conversation: binding(for: conversation),
                    messageInput: $messageInput,
                    isLoading: $isLoading,
                    onSend: sendMessage
                )
            } else {
                EmptyConversationView(onNewConversation: createNewConversation)
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: createNewConversation) {
                    Image(systemName: "square.and.pencil")
                }
                .help("New Conversation")
                .keyboardShortcut("n", modifiers: .command)
            }
        }
    }

    private func binding(for conversation: Conversation) -> Binding<Conversation> {
        guard let index = appState.conversations.firstIndex(where: { $0.id == conversation.id }) else {
            return .constant(conversation)
        }
        return $appState.conversations[index]
    }

    private func createNewConversation() {
        appState.createNewConversation()
        selectedConversation = appState.currentConversation
    }

    private func sendMessage() {
        guard !messageInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard var conversation = selectedConversation else { return }

        let userMessage = Message(
            id: UUID().uuidString,
            role: .user,
            content: messageInput,
            timestamp: Date()
        )

        conversation.messages.append(userMessage)
        messageInput = ""
        isLoading = true

        // Update local state
        if let index = appState.conversations.firstIndex(where: { $0.id == conversation.id }) {
            appState.conversations[index] = conversation
        }

        // Send to API
        Task {
            do {
                let response = try await appState.apiClient.sendMessage(
                    conversationId: conversation.id,
                    content: userMessage.content
                )

                let assistantMessage = Message(
                    id: UUID().uuidString,
                    role: .assistant,
                    content: response.content,
                    timestamp: Date()
                )

                await MainActor.run {
                    if let index = appState.conversations.firstIndex(where: { $0.id == conversation.id }) {
                        appState.conversations[index].messages.append(assistantMessage)
                        appState.conversations[index].updatedAt = Date()
                        selectedConversation = appState.conversations[index]
                    }
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    isLoading = false
                    // TODO: Show error alert
                }
            }
        }
    }
}

/// Conversation list sidebar
struct ConversationListView: View {
    let conversations: [Conversation]
    @Binding var selectedConversation: Conversation?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Conversations")
                    .font(.headline)
                Spacer()
            }
            .padding(.horizontal)
            .padding(.vertical, 12)

            Divider()

            // Conversation list
            if conversations.isEmpty {
                VStack {
                    Spacer()
                    Text("No conversations yet")
                        .foregroundColor(.secondary)
                    Text("Start a new conversation")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                List(selection: $selectedConversation) {
                    ForEach(conversations) { conversation in
                        ConversationRow(conversation: conversation)
                            .tag(conversation)
                    }
                }
                .listStyle(.sidebar)
            }
        }
        .background(Color(NSColor.controlBackgroundColor))
    }
}

/// Single conversation row
struct ConversationRow: View {
    let conversation: Conversation

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(conversation.title)
                .font(.body)
                .lineLimit(1)

            HStack {
                Text(conversation.updatedAt, style: .relative)
                    .font(.caption)
                    .foregroundColor(.secondary)

                Spacer()

                Text("\(conversation.messages.count) messages")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

/// Conversation detail view with messages and input
struct ConversationDetailView: View {
    @Binding var conversation: Conversation
    @Binding var messageInput: String
    @Binding var isLoading: Bool
    let onSend: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Messages area
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(conversation.messages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }

                        if isLoading {
                            LoadingIndicator()
                                .id("loading")
                        }
                    }
                    .padding()
                }
                .onChange(of: conversation.messages.count) { _, _ in
                    if let lastMessage = conversation.messages.last {
                        withAnimation {
                            proxy.scrollTo(lastMessage.id, anchor: .bottom)
                        }
                    }
                }
                .onChange(of: isLoading) { _, newValue in
                    if newValue {
                        withAnimation {
                            proxy.scrollTo("loading", anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            // Input area
            MessageInputView(
                text: $messageInput,
                isLoading: isLoading,
                onSend: onSend
            )
        }
    }
}

/// Single message bubble
struct MessageBubble: View {
    let message: Message

    var body: some View {
        HStack {
            if message.role == .user {
                Spacer(minLength: 60)
            }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                // Role indicator
                HStack(spacing: 4) {
                    Image(systemName: message.role == .user ? "person.circle" : "cpu")
                        .font(.caption)
                    Text(message.role == .user ? "You" : "Claude")
                        .font(.caption)
                        .fontWeight(.medium)
                }
                .foregroundColor(.secondary)

                // Message content with Markdown
                MarkdownText(content: message.content)
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(message.role == .user
                                  ? Color.accentColor.opacity(0.15)
                                  : Color.secondary.opacity(0.1))
                    )

                // Timestamp
                Text(message.timestamp, style: .time)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

            if message.role == .assistant {
                Spacer(minLength: 60)
            }
        }
    }
}

/// Markdown text renderer
struct MarkdownText: View {
    let content: String

    var body: some View {
        // Use AttributedString for Markdown rendering
        if let attributedString = try? AttributedString(markdown: content) {
            Text(attributedString)
                .textSelection(.enabled)
        } else {
            Text(content)
                .textSelection(.enabled)
        }
    }
}

/// Message input view
struct MessageInputView: View {
    @Binding var text: String
    let isLoading: Bool
    let onSend: () -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            // Text editor
            TextEditor(text: $text)
                .font(.body)
                .frame(minHeight: 36, maxHeight: 120)
                .padding(8)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                )
                .disabled(isLoading)

            // Send button
            Button(action: onSend) {
                Image(systemName: isLoading ? "ellipsis" : "arrow.up.circle.fill")
                    .font(.title2)
            }
            .buttonStyle(.plain)
            .foregroundColor(text.isEmpty || isLoading ? .secondary : .accentColor)
            .disabled(text.isEmpty || isLoading)
            .keyboardShortcut(.return, modifiers: .command)
        }
        .padding()
    }
}

/// Loading indicator for assistant response
struct LoadingIndicator: View {
    @State private var animationPhase = 0

    var body: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3) { index in
                    Circle()
                        .fill(Color.secondary)
                        .frame(width: 8, height: 8)
                        .scaleEffect(animationPhase == index ? 1.2 : 1.0)
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.secondary.opacity(0.1))
            )
            Spacer()
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.4).repeatForever()) {
                animationPhase = (animationPhase + 1) % 3
            }
        }
    }
}

/// Empty state when no conversation is selected
struct EmptyConversationView: View {
    let onNewConversation: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("Select a conversation or start a new one")
                .font(.headline)
                .foregroundColor(.secondary)

            Button("New Conversation", action: onNewConversation)
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Hashable Conformance

extension Conversation: Hashable {
    static func == (lhs: Conversation, rhs: Conversation) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Preview

#Preview {
    ChatView()
        .environmentObject(AppState())
}
