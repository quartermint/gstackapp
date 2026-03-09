import { useState, type KeyboardEvent, type RefObject } from "react";
import TextareaAutosize from "react-textarea-autosize";

interface CaptureFieldProps {
  onSubmit: (content: string) => void;
  isPending?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

/**
 * Always-visible auto-growing capture input at the top of the dashboard.
 *
 * - Enter submits and clears text (cursor stays in field for rapid-fire stacking)
 * - Shift+Enter inserts newline
 * - Auto-grows from 1 to 4 lines
 * - Shows subtle "Capturing..." indicator when pending
 */
export function CaptureField({
  onSubmit,
  isPending = false,
  inputRef,
}: CaptureFieldProps) {
  const [value, setValue] = useState("");

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setValue("");
      }
    }
  }

  return (
    <div className="relative">
      <TextareaAutosize
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What's on your mind..."
        minRows={1}
        maxRows={4}
        className={[
          "w-full resize-none",
          "bg-surface-elevated dark:bg-surface-elevated-dark",
          "rounded-lg px-4 py-3",
          "text-text-primary dark:text-text-primary-dark",
          "border border-warm-gray/30 dark:border-warm-gray/20",
          "focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta/30",
          "placeholder:text-text-muted dark:placeholder:text-text-muted-dark",
          "transition-colors",
        ].join(" ")}
        disabled={isPending}
      />
      {isPending && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-terracotta">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-terracotta animate-pulse" />
          Capturing...
        </span>
      )}
    </div>
  );
}
