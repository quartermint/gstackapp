import { useEffect, useRef } from "react";

interface KeyboardShortcutHandlers {
  /** Cmd+K (or Ctrl+K on non-Mac): open command palette */
  onCmdK: () => void;
  /** '/' key: focus capture field (only when no input/textarea focused) */
  onSlash: () => void;
  /** Escape: close palette or blur field */
  onEscape: () => void;
}

/**
 * Global keyboard shortcut listener for Mission Control.
 * Uses useRef pattern to avoid stale closures -- handlers always reference latest values.
 *
 * - Cmd+K / Ctrl+K: triggers onCmdK, preventDefault to avoid browser defaults
 * - '/': triggers onSlash ONLY when active element is NOT an input, textarea, or contenteditable
 * - Escape: triggers onEscape
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handlersRef.current.onCmdK();
        return;
      }

      // Escape
      if (e.key === "Escape") {
        handlersRef.current.onEscape();
        return;
      }

      // '/' -- only when not in an input, textarea, or contenteditable
      if (e.key === "/") {
        const active = document.activeElement;
        if (active) {
          const tagName = active.tagName.toLowerCase();
          if (
            tagName === "input" ||
            tagName === "textarea" ||
            (active as HTMLElement).isContentEditable
          ) {
            return; // Don't intercept when user is typing
          }
        }
        e.preventDefault();
        handlersRef.current.onSlash();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
