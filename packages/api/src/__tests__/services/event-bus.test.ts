import { describe, it, expect, beforeEach } from "vitest";

describe("Event Bus", () => {
  // Re-import fresh module for each test to avoid singleton pollution
  let MCEventBus: typeof import("../../services/event-bus.js").MCEventBus;
  let eventBus: typeof import("../../services/event-bus.js").eventBus;

  beforeEach(async () => {
    const mod = await import("../../services/event-bus.js");
    MCEventBus = mod.MCEventBus;
    eventBus = mod.eventBus;
  });

  it("emits events to registered listeners", () => {
    const bus = new MCEventBus();
    const received: unknown[] = [];

    bus.on("mc:event", (event) => {
      received.push(event);
    });

    bus.emit("mc:event", { type: "capture:created", id: "cap-1" });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: "capture:created", id: "cap-1" });
  });

  it("delivers events to multiple listeners", () => {
    const bus = new MCEventBus();
    const received1: unknown[] = [];
    const received2: unknown[] = [];

    bus.on("mc:event", (event) => received1.push(event));
    bus.on("mc:event", (event) => received2.push(event));

    bus.emit("mc:event", { type: "scan:complete", id: "all" });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    expect(received1[0]).toEqual({ type: "scan:complete", id: "all" });
    expect(received2[0]).toEqual({ type: "scan:complete", id: "all" });
  });

  it("does not deliver events to removed listeners", () => {
    const bus = new MCEventBus();
    const received: unknown[] = [];

    const handler = (event: unknown) => received.push(event);
    bus.on("mc:event", handler);
    bus.removeListener("mc:event", handler);

    bus.emit("mc:event", { type: "capture:archived", id: "cap-2" });

    expect(received).toHaveLength(0);
  });

  it("enforces typed MCEvent interface with valid event types", () => {
    const bus = new MCEventBus();
    const received: unknown[] = [];

    bus.on("mc:event", (event) => received.push(event));

    // All valid event types
    bus.emit("mc:event", { type: "capture:created", id: "1" });
    bus.emit("mc:event", { type: "capture:enriched", id: "2" });
    bus.emit("mc:event", { type: "capture:archived", id: "3" });
    bus.emit("mc:event", { type: "scan:complete", id: "all" });

    expect(received).toHaveLength(4);
  });

  it("exports a singleton eventBus instance", () => {
    expect(eventBus).toBeDefined();
    expect(eventBus).toBeInstanceOf(MCEventBus);
  });
});
