import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eventBus, type MCEvent } from "../services/event-bus.js";

/**
 * SSE endpoint for real-time domain event streaming.
 * Clients connect to /events and receive typed events as they occur.
 *
 * IMPORTANT: Uses a serial write queue to prevent TransformStream backpressure
 * from accumulating unbounded pending promises. Without this, rapid event
 * bursts (e.g., post-scan) can create microtask storms that starve the
 * Node.js event loop macrotask queue (timers, I/O), effectively freezing
 * the server.
 */

/** Max events buffered per SSE connection before dropping oldest */
const MAX_QUEUE_SIZE = 50;

/** Timeout for a single SSE write before we consider the connection dead */
const WRITE_TIMEOUT_MS = 5_000;

export const eventRoutes = new Hono().get("/events", (c) => {
  return streamSSE(c, async (stream) => {
    let eventId = 0;
    let writing = false;
    let closed = false;
    const queue: MCEvent[] = [];

    /**
     * Drain the write queue serially. Only one write is in flight at a time.
     * If a write times out, we treat the connection as dead and stop.
     */
    async function drainQueue(): Promise<void> {
      if (writing || closed) return;
      writing = true;

      try {
        while (queue.length > 0 && !closed) {
          const event = queue.shift()!;
          const id = eventId++;

          // Race the write against a timeout to prevent hanging forever
          // on a backpressured/dead TransformStream
          const writePromise = stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
            id: String(id),
          });

          const timeoutPromise = new Promise<"timeout">((resolve) =>
            setTimeout(() => resolve("timeout"), WRITE_TIMEOUT_MS)
          );

          const result = await Promise.race([writePromise, timeoutPromise]);

          if (result === "timeout") {
            // Write timed out — connection is likely dead or severely backpressured.
            // Stop writing to prevent accumulating more pending promises.
            console.warn("[SSE] Write timed out, stopping event delivery to this client");
            closed = true;
            queue.length = 0;
            return;
          }

          // Yield to the macrotask queue between writes so timers/IO can run.
          // This prevents a microtask storm when draining a backlog of events.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      } catch {
        // Write failed (client disconnected). Stop processing.
        closed = true;
        queue.length = 0;
      } finally {
        writing = false;
      }
    }

    const handler = (event: MCEvent) => {
      if (closed) return;

      queue.push(event);

      // Drop oldest events if queue overflows (keep newest)
      while (queue.length > MAX_QUEUE_SIZE) {
        queue.shift();
      }

      // Kick off drain (no-op if already draining)
      // Use setTimeout(0) to avoid running drainQueue synchronously inside
      // the EventEmitter emit() call, which would block other listeners.
      setTimeout(() => {
        drainQueue().catch(() => {
          closed = true;
        });
      }, 0);
    };

    eventBus.on("mc:event", handler);

    stream.onAbort(() => {
      closed = true;
      queue.length = 0;
      eventBus.removeListener("mc:event", handler);
    });

    // Keep connection alive with periodic heartbeat comments
    // eslint-disable-next-line no-constant-condition
    while (!closed) {
      await stream.sleep(30_000);
    }
  });
});
