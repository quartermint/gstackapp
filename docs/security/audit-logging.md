# Audit Logging

This document describes the audit logging system for security monitoring and forensics.

## Overview

All significant actions in Mission Control are logged to Convex for:
- Security monitoring
- Anomaly detection
- Incident investigation
- Compliance

## Event Schema

### Base Event

```typescript
interface AuditEvent {
  // Identifiers
  id: string;                    // Unique event ID
  requestId: string;             // Request correlation ID
  timestamp: number;             // Unix timestamp (ms)

  // Source
  source: {
    ip: string;
    userAgent?: string;
    nodeHostname?: string;
  };

  // Context
  trustLevel: TrustLevel;
  agent?: string;
  userId?: string;

  // Event details
  eventType: EventType;
  action: string;
  success: boolean;

  // Additional data
  metadata?: Record<string, unknown>;

  // Error info
  errorCode?: string;
  errorMessage?: string;

  // Performance
  duration?: number;
}

type EventType =
  | "REQUEST"
  | "AUTH"
  | "SANITIZE"
  | "ROUTE"
  | "EXECUTE"
  | "TOOL"
  | "RESPONSE"
  | "ERROR"
  | "SECURITY";
```

### Specific Event Types

#### Request Events

```typescript
interface RequestEvent extends AuditEvent {
  eventType: "REQUEST";
  metadata: {
    method: string;
    path: string;
    contentLength: number;
  };
}
```

#### Auth Events

```typescript
interface AuthEvent extends AuditEvent {
  eventType: "AUTH";
  metadata: {
    authMethod: "token" | "tailscale" | "none";
    tokenValid?: boolean;
    tokenExpiry?: number;
  };
}
```

#### Sanitize Events

```typescript
interface SanitizeEvent extends AuditEvent {
  eventType: "SANITIZE";
  metadata: {
    inputLength: number;
    blocked: boolean;
    pattern?: string;
  };
}
```

#### Tool Events

```typescript
interface ToolEvent extends AuditEvent {
  eventType: "TOOL";
  metadata: {
    tool: string;
    args: Record<string, unknown>;
    result?: "success" | "error" | "blocked";
  };
}
```

#### Security Events

```typescript
interface SecurityEvent extends AuditEvent {
  eventType: "SECURITY";
  metadata: {
    severity: "low" | "medium" | "high" | "critical";
    category: string;
    details: string;
  };
}
```

## Convex Schema

```typescript
// convex/schema.ts
export default defineSchema({
  auditLog: defineTable({
    requestId: v.string(),
    timestamp: v.number(),

    source: v.object({
      ip: v.string(),
      userAgent: v.optional(v.string()),
      nodeHostname: v.optional(v.string()),
    }),

    trustLevel: v.string(),
    agent: v.optional(v.string()),
    userId: v.optional(v.string()),

    eventType: v.string(),
    action: v.string(),
    success: v.boolean(),

    metadata: v.optional(v.any()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    duration: v.optional(v.number()),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_requestId", ["requestId"])
    .index("by_eventType", ["eventType", "timestamp"])
    .index("by_source_ip", ["source.ip", "timestamp"]),
});
```

## Logging Implementation

### Logger Service

```typescript
// packages/hub/src/services/audit.ts
import { api } from "../convex/_generated/api";
import { ConvexClient } from "convex/browser";

class AuditLogger {
  private client: ConvexClient;
  private buffer: AuditEvent[] = [];
  private flushInterval: NodeJS.Timer;

  constructor(convexUrl: string) {
    this.client = new ConvexClient(convexUrl);
    // Flush buffer every second
    this.flushInterval = setInterval(() => this.flush(), 1000);
  }

  log(event: Omit<AuditEvent, "id" | "timestamp">): void {
    const fullEvent: AuditEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    this.buffer.push(fullEvent);

    // Immediate flush for security events
    if (event.eventType === "SECURITY") {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = this.buffer;
    this.buffer = [];

    try {
      await this.client.mutation(api.audit.logBatch, { events });
    } catch (error) {
      // Re-add events on failure
      this.buffer.unshift(...events);
      console.error("Audit flush failed:", error);
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flush();
  }
}

export const auditLogger = new AuditLogger(process.env.CONVEX_URL!);
```

### Convex Functions

```typescript
// convex/audit.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const logBatch = mutation({
  args: {
    events: v.array(v.object({
      id: v.string(),
      requestId: v.string(),
      timestamp: v.number(),
      source: v.object({
        ip: v.string(),
        userAgent: v.optional(v.string()),
        nodeHostname: v.optional(v.string()),
      }),
      trustLevel: v.string(),
      agent: v.optional(v.string()),
      userId: v.optional(v.string()),
      eventType: v.string(),
      action: v.string(),
      success: v.boolean(),
      metadata: v.optional(v.any()),
      errorCode: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
      duration: v.optional(v.number()),
    })),
  },
  handler: async (ctx, { events }) => {
    for (const event of events) {
      await ctx.db.insert("auditLog", event);
    }
  },
});

export const getByRequestId = query({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) => {
    return await ctx.db
      .query("auditLog")
      .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
      .collect();
  },
});

export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
    eventType: v.optional(v.string()),
  },
  handler: async (ctx, { limit = 100, eventType }) => {
    let query = ctx.db.query("auditLog");

    if (eventType) {
      query = query.withIndex("by_eventType", (q) =>
        q.eq("eventType", eventType)
      );
    }

    return await query.order("desc").take(limit);
  },
});
```

## Anomaly Detection

### Detection Rules

```typescript
interface AnomalyRule {
  id: string;
  name: string;
  description: string;
  query: (events: AuditEvent[]) => boolean;
  window: number;  // Time window in ms
  action: "log" | "alert" | "block";
  severity: "low" | "medium" | "high" | "critical";
}

const ANOMALY_RULES: AnomalyRule[] = [
  {
    id: "high_error_rate",
    name: "High Error Rate",
    description: "More than 10 errors per minute from single source",
    query: (events) => {
      const errors = events.filter((e) => !e.success);
      return errors.length > 10;
    },
    window: 60_000,
    action: "alert",
    severity: "high",
  },

  {
    id: "injection_attempts",
    name: "Injection Attempts",
    description: "Multiple blocked sanitization attempts",
    query: (events) => {
      const blocked = events.filter(
        (e) => e.eventType === "SANITIZE" && e.metadata?.blocked
      );
      return blocked.length >= 3;
    },
    window: 300_000,
    action: "block",
    severity: "critical",
  },

  {
    id: "unusual_tool_usage",
    name: "Unusual Tool Usage",
    description: "Excessive tool calls in short period",
    query: (events) => {
      const toolEvents = events.filter((e) => e.eventType === "TOOL");
      return toolEvents.length > 50;
    },
    window: 60_000,
    action: "alert",
    severity: "medium",
  },

  {
    id: "auth_failures",
    name: "Authentication Failures",
    description: "Multiple auth failures from single IP",
    query: (events) => {
      const authFails = events.filter(
        (e) => e.eventType === "AUTH" && !e.success
      );
      return authFails.length >= 5;
    },
    window: 300_000,
    action: "block",
    severity: "high",
  },
];
```

### Detection Engine

```typescript
class AnomalyDetector {
  private eventsBySource: Map<string, AuditEvent[]> = new Map();

  processEvent(event: AuditEvent): void {
    const key = event.source.ip;
    const events = this.eventsBySource.get(key) || [];
    events.push(event);
    this.eventsBySource.set(key, events);

    // Check rules
    for (const rule of ANOMALY_RULES) {
      const windowEvents = events.filter(
        (e) => e.timestamp > Date.now() - rule.window
      );

      if (rule.query(windowEvents)) {
        this.handleAnomaly(rule, event.source.ip, windowEvents);
      }
    }

    // Cleanup old events
    this.cleanup();
  }

  private handleAnomaly(
    rule: AnomalyRule,
    sourceIp: string,
    events: AuditEvent[]
  ): void {
    // Log security event
    auditLogger.log({
      requestId: events[0]?.requestId || "anomaly",
      source: { ip: sourceIp },
      trustLevel: "untrusted",
      eventType: "SECURITY",
      action: `ANOMALY_DETECTED:${rule.id}`,
      success: false,
      metadata: {
        severity: rule.severity,
        rule: rule.name,
        description: rule.description,
        eventCount: events.length,
      },
    });

    // Take action
    switch (rule.action) {
      case "block":
        blockSource(sourceIp, rule.window);
        break;
      case "alert":
        sendAlert(rule, sourceIp);
        break;
    }
  }

  private cleanup(): void {
    const cutoff = Date.now() - 600_000; // 10 minute max
    for (const [key, events] of this.eventsBySource) {
      const recent = events.filter((e) => e.timestamp > cutoff);
      if (recent.length === 0) {
        this.eventsBySource.delete(key);
      } else {
        this.eventsBySource.set(key, recent);
      }
    }
  }
}
```

## Querying Logs

### Dashboard Queries

```typescript
// Recent security events
const securityEvents = await convex.query(api.audit.getRecent, {
  eventType: "SECURITY",
  limit: 50,
});

// Events for specific request
const requestEvents = await convex.query(api.audit.getByRequestId, {
  requestId: "abc-123",
});

// Error rate over time
const errorRate = await convex.query(api.audit.getErrorRate, {
  window: 3600_000, // 1 hour
  bucketSize: 60_000, // 1 minute buckets
});
```

### CLI Investigation

```bash
# Recent errors
npx convex run audit:getRecent '{"limit": 20}' | jq '.[] | select(.success == false)'

# Events from specific IP
npx convex run audit:getByIp '{"ip": "1.2.3.4", "limit": 100}'

# Security events today
npx convex run audit:getRecent '{"eventType": "SECURITY", "limit": 1000}'
```

## Retention

Configure log retention in Convex:

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";

const crons = cronJobs();

// Cleanup logs older than 30 days
crons.daily(
  "cleanup-audit-logs",
  { hourUTC: 3, minuteUTC: 0 },
  api.audit.cleanup,
  { olderThanDays: 30 }
);

export default crons;
```

## Privacy Considerations

1. **PII handling** - Don't log full request bodies
2. **Truncation** - Limit stored message lengths
3. **Hashing** - Hash sensitive identifiers
4. **Access control** - Restrict log access
5. **Retention** - Delete old logs regularly
