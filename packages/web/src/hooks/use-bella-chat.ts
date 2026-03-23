import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export function useBellaChat() {
  return useChat({
    id: "bella-chat",
    transport: new TextStreamChatTransport({
      api: `${API_BASE}/api/chat`,
    }),
    onError: (error) => {
      console.error("Chat error:", error);
    },
  });
}
