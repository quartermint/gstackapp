import { EventEmitter } from "node:events";

/**
 * Domain event types emitted throughout Mission Control.
 */
export type MCEventType =
  | "capture:created"
  | "capture:enriched"
  | "capture:archived"
  | "scan:complete"
  | "health:changed"
  | "copy:diverged"
  // v1.2 Session events
  | "session:started"
  | "session:ended"
  | "session:conflict"
  | "session:abandoned"
  | "budget:updated"
  // v1.3 Discovery events
  | "discovery:found"
  | "discovery:promoted"
  | "discovery:dismissed"
  // v1.3 Star Intelligence events
  | "star:synced"
  | "star:categorized"
  // v1.3 Session Enrichment events
  | "convergence:detected"
  // v1.4 Knowledge Aggregation events
  | "knowledge:updated"
  // v2.0 Embedding events
  | "embedding:backfill";

/**
 * Typed domain event payload.
 */
export interface MCEvent {
  type: MCEventType;
  id: string;
  data?: Record<string, unknown>;
}

/**
 * Typed EventEmitter for Mission Control domain events.
 * All events flow through the "mc:event" channel.
 */
export class MCEventBus extends EventEmitter {
  constructor() {
    super();
    // Support multiple browser tabs / SSE connections
    this.setMaxListeners(20);
  }

  override emit(event: "mc:event", payload: MCEvent): boolean;
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  override on(event: "mc:event", listener: (payload: MCEvent) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  override removeListener(event: "mc:event", listener: (payload: MCEvent) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.removeListener(event, listener);
  }
}

/**
 * Singleton event bus instance shared across the application.
 */
export const eventBus = new MCEventBus();
