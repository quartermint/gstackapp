import { useState } from "react";
import { useBellaChat } from "../../hooks/use-bella-chat.js";
import { BellaLayout } from "./bella-layout.js";
import { ChatMessages } from "./chat-messages.js";
import { ChatInput } from "./chat-input.js";
import { ApiExplorer } from "./api-explorer.js";

export default function BellaChat() {
  const { messages, sendMessage, status, error } = useBellaChat();
  const [explorerOpen, setExplorerOpen] = useState(false);
  const isLoading = status === "submitted" || status === "streaming";

  return (
    <BellaLayout onExplorerToggle={() => setExplorerOpen((v) => !v)}>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6">
          <ChatMessages messages={messages} isLoading={isLoading} />
        </div>
        {error && (
          <div className="px-5 sm:px-8 py-2 text-sm text-rust">
            {error.message.includes("503")
              ? "MC's brain is warming up -- try again in a moment."
              : `Error: ${error.message}`}
          </div>
        )}
        <div className="border-t border-warm-gray/10 dark:border-warm-gray/5 px-5 sm:px-8 py-4">
          <ChatInput
            onSubmit={(text) => sendMessage({ text })}
            isLoading={isLoading}
          />
        </div>
      </div>
      <ApiExplorer open={explorerOpen} onClose={() => setExplorerOpen(false)} />
    </BellaLayout>
  );
}
