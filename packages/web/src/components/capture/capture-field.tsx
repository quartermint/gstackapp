import { useState, type KeyboardEvent, type RefObject } from "react";
import TextareaAutosize from "react-textarea-autosize";

interface CaptureFieldProps {
  onSubmit: (content: string) => void;
  isPending?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

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
    <div className="relative group">
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
          "rounded-xl px-5 py-4 text-[15px]",
          "text-text-primary dark:text-text-primary-dark",
          "border border-warm-gray/20 dark:border-warm-gray/10",
          "focus:border-terracotta/40 focus:outline-none",
          "focus:shadow-[0_0_0_3px_rgba(212,113,58,0.08),0_0_30px_-5px_rgba(212,113,58,0.12)]",
          "placeholder:text-text-muted/50 dark:placeholder:text-text-muted-dark/50",
          "transition-all duration-300",
        ].join(" ")}
        disabled={isPending}
      />
      {isPending ? (
        <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-terracotta font-medium">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-terracotta animate-pulse" />
          Capturing...
        </span>
      ) : (
        <kbd className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-text-muted/30 dark:text-text-muted-dark/30 border border-warm-gray/10 rounded px-1.5 py-0.5 font-mono group-focus-within:opacity-0 transition-opacity pointer-events-none">
          /
        </kbd>
      )}
    </div>
  );
}
