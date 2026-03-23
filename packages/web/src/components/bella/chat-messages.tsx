import { useEffect, useRef } from "react";
import type { UIMessage } from "@ai-sdk/react";

interface ChatMessagesProps {
  messages: UIMessage[];
  isLoading: boolean;
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <p className="text-lg font-display italic text-text-secondary dark:text-text-secondary-dark">
            Hey! Ask me anything.
          </p>
          <p className="text-sm text-text-muted dark:text-text-muted-dark max-w-md">
            I can tell you about Ryan's projects, captures, and sessions.
            Try: "What's Ryan working on?" or "Tell me about mission-control."
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              message.role === "user"
                ? "bg-terracotta/10 text-text-primary dark:text-text-primary-dark"
                : "bg-surface-elevated dark:bg-surface-elevated-dark border border-warm-gray/10 dark:border-warm-gray/6 text-text-primary dark:text-text-primary-dark"
            }`}
          >
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return <span key={i}>{part.text}</span>;
              }
              // With text stream protocol, tool parts don't arrive.
              // When upgraded to data protocol, tool-* parts will appear here.
              return null;
            })}
          </div>
        </div>
      ))}

      {isLoading && messages[messages.length - 1]?.role === "user" && (
        <div className="flex justify-start">
          <div className="bg-surface-elevated dark:bg-surface-elevated-dark border border-warm-gray/10 dark:border-warm-gray/6 rounded-2xl px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs text-text-muted dark:text-text-muted-dark">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-terracotta animate-pulse" />
              Thinking...
            </span>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
