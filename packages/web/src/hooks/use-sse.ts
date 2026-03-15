import { useEffect, useRef } from "react";

interface SSEOptions {
  /** Called when a capture is created */
  onCaptureCreated?: (id: string) => void;
  /** Called when a capture is enriched */
  onCaptureEnriched?: (id: string) => void;
  /** Called when a capture is archived */
  onCaptureArchived?: (id: string) => void;
  /** Called when a project scan completes */
  onScanComplete?: () => void;
  /** Called when health state changes after a scan cycle */
  onHealthChanged?: () => void;
  /** Called when copy divergence is detected */
  onCopyDiverged?: (id: string) => void;
}

/**
 * Hook to connect to the SSE event stream at /api/events.
 * Dispatches callbacks on domain events with auto-reconnect and exponential backoff.
 *
 * Uses useRef for options to avoid stale closure issues (same pattern as useKeyboardShortcuts).
 * Does NOT show SSE connection state visually -- health dot already shows API reachability.
 */
export function useSSE(options: SSEOptions): void {
  const optionsRef = useRef(options);

  // Keep ref in sync with latest options (avoids stale closures)
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryCount = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;

      eventSource = new EventSource("/api/events");

      eventSource.onopen = () => {
        // Reset retry count on successful connection
        retryCount = 0;
      };

      // Listen for each SSE event type
      eventSource.addEventListener("capture:created", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { type: string; id: string };
          optionsRef.current.onCaptureCreated?.(data.id);
        } catch {
          // Ignore malformed events
        }
      });

      eventSource.addEventListener("capture:enriched", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { type: string; id: string };
          optionsRef.current.onCaptureEnriched?.(data.id);
        } catch {
          // Ignore malformed events
        }
      });

      eventSource.addEventListener("capture:archived", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { type: string; id: string };
          optionsRef.current.onCaptureArchived?.(data.id);
        } catch {
          // Ignore malformed events
        }
      });

      eventSource.addEventListener("scan:complete", (e: MessageEvent) => {
        try {
          JSON.parse(e.data); // Validate it's valid JSON
          optionsRef.current.onScanComplete?.();
        } catch {
          // Ignore malformed events
        }
      });

      eventSource.addEventListener("health:changed", (e: MessageEvent) => {
        try {
          JSON.parse(e.data); // Validate it's valid JSON
          optionsRef.current.onHealthChanged?.();
        } catch {
          // Ignore malformed events
        }
      });

      eventSource.addEventListener("copy:diverged", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { type: string; id: string };
          optionsRef.current.onCopyDiverged?.(data.id);
        } catch {
          // Ignore malformed events
        }
      });

      eventSource.onerror = () => {
        // Close current connection
        eventSource?.close();
        eventSource = null;

        if (disposed) return;

        // Exponential backoff with jitter
        const delay =
          Math.min(1000 * Math.pow(2, retryCount), 30_000) +
          Math.random() * 1000;
        retryCount++;

        retryTimeout = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      disposed = true;
      eventSource?.close();
      if (retryTimeout !== null) {
        clearTimeout(retryTimeout);
      }
    };
  }, []);
}
