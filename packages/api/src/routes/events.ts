import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eventBus, type MCEvent } from "../services/event-bus.js";

/**
 * SSE endpoint for real-time domain event streaming.
 * Clients connect to /events and receive typed events as they occur.
 */
export const eventRoutes = new Hono().get("/events", (c) => {
  return streamSSE(c, async (stream) => {
    let eventId = 0;

    const handler = (event: MCEvent) => {
      stream
        .writeSSE({
          event: event.type,
          data: JSON.stringify(event),
          id: String(eventId++),
        })
        .catch(() => {
          // Client may have disconnected — ignore write errors
        });
    };

    eventBus.on("mc:event", handler);

    stream.onAbort(() => {
      eventBus.removeListener("mc:event", handler);
    });

    // Keep connection alive
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await stream.sleep(30_000);
    }
  });
});
