import { useState, type KeyboardEvent } from "react";
import TextareaAutosize from "react-textarea-autosize";

interface ChatInputProps {
  onSubmit: (text: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSubmit, isLoading }: ChatInputProps) {
  const [value, setValue] = useState("");

  function handleSend() {
    const trimmed = value.trim();
    if (trimmed && !isLoading) {
      onSubmit(trimmed);
      setValue("");
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex items-end gap-3">
      <TextareaAutosize
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about projects, captures, or sessions..."
        minRows={1}
        maxRows={4}
        className={[
          "flex-1 resize-none",
          "bg-surface-elevated dark:bg-surface-elevated-dark",
          "rounded-xl px-4 py-3 text-[15px]",
          "text-text-primary dark:text-text-primary-dark",
          "border border-warm-gray/20 dark:border-warm-gray/10",
          "focus:border-terracotta/40 focus:outline-none",
          "focus:shadow-[0_0_0_3px_rgba(212,113,58,0.08)]",
          "placeholder:text-text-muted/50 dark:placeholder:text-text-muted-dark/50",
          "transition-all duration-200",
        ].join(" ")}
        disabled={isLoading}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={!value.trim() || isLoading}
        className={[
          "shrink-0 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
          value.trim() && !isLoading
            ? "bg-terracotta text-white hover:bg-terracotta/90 shadow-sm"
            : "bg-warm-gray/10 text-text-muted dark:text-text-muted-dark cursor-not-allowed",
        ].join(" ")}
      >
        {isLoading ? (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.125A59.769 59.769 0 0121.485 12 59.768 59.768 0 013.27 20.875L5.999 12zm0 0h7.5" />
          </svg>
        )}
      </button>
    </div>
  );
}
