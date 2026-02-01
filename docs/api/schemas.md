# API Schemas

This document defines the Zod schemas used for all API boundaries in Mission Control.

## Overview

All external interfaces use Zod schemas for:
- Runtime validation
- Type inference
- Documentation
- Error messages

## Core Schemas

### ChatRequest

Request to the chat endpoint.

```typescript
import { z } from "zod";

export const ChatRequestSchema = z.object({
  // The user's message
  message: z.string()
    .min(1, "Message cannot be empty")
    .max(10_000, "Message too long"),

  // Optional conversation ID for context
  conversationId: z.string().uuid().optional(),

  // Optional hints for routing
  intent: z.enum(["chat", "code", "task"]).optional(),

  // Optional metadata
  metadata: z.object({
    source: z.enum(["web", "mobile", "api"]).optional(),
    clientVersion: z.string().optional(),
  }).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
```

**Example:**
```json
{
  "message": "How do I implement a binary search in TypeScript?",
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "intent": "code",
  "metadata": {
    "source": "mobile",
    "clientVersion": "1.0.0"
  }
}
```

### ChatResponse

Response from the chat endpoint.

```typescript
export const ChatResponseSchema = z.object({
  // The assistant's response
  message: z.string(),

  // Request tracking
  requestId: z.string().uuid(),

  // Conversation ID (new or existing)
  conversationId: z.string().uuid(),

  // Response metadata
  metadata: z.object({
    agent: z.string(),
    model: z.string(),
    tokens: z.object({
      input: z.number(),
      output: z.number(),
    }),
    duration: z.number(),
  }).optional(),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;
```

**Example:**
```json
{
  "message": "Here's how to implement binary search...",
  "requestId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "metadata": {
    "agent": "code-assistant",
    "model": "claude-3-opus",
    "tokens": {
      "input": 42,
      "output": 256
    },
    "duration": 1234
  }
}
```

### ErrorResponse

Standard error response format.

```typescript
export const ErrorResponseSchema = z.object({
  error: z.enum([
    "RATE_LIMITED",
    "UNAUTHORIZED",
    "INVALID_TOKEN",
    "INVALID_REQUEST",
    "REQUEST_BLOCKED",
    "AGENT_ERROR",
    "INTERNAL_ERROR",
    "TIMEOUT",
  ]),

  message: z.string(),

  requestId: z.string().uuid(),

  // Additional error details
  details: z.record(z.unknown()).optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
```

**Example:**
```json
{
  "error": "RATE_LIMITED",
  "message": "Too many requests, please try again later",
  "requestId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "details": {
    "retryAfter": 60
  }
}
```

## Task Schemas

### TaskDispatch

Request to dispatch a task to a compute node.

```typescript
export const TaskDispatchSchema = z.object({
  // Task type
  type: z.enum(["shell", "code", "build", "custom"]),

  // Task-specific payload
  payload: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("shell"),
      command: z.string().max(1000),
    }),
    z.object({
      type: z.literal("code"),
      language: z.enum(["javascript", "typescript", "python"]),
      code: z.string().max(50_000),
    }),
    z.object({
      type: z.literal("build"),
      repoPath: z.string(),
      command: z.string(),
    }),
    z.object({
      type: z.literal("custom"),
      handler: z.string(),
      args: z.record(z.unknown()),
    }),
  ]),

  // Execution preferences
  options: z.object({
    // Preferred node (hostname)
    preferNode: z.string().optional(),
    // Timeout in ms
    timeout: z.number().max(600_000).optional(),
    // Priority (0-10)
    priority: z.number().min(0).max(10).default(5),
  }).optional(),
});

export type TaskDispatch = z.infer<typeof TaskDispatchSchema>;
```

**Example:**
```json
{
  "type": "code",
  "payload": {
    "type": "code",
    "language": "typescript",
    "code": "console.log('Hello, world!');"
  },
  "options": {
    "preferNode": "macmini",
    "timeout": 30000,
    "priority": 7
  }
}
```

### TaskResult

Result from a completed task.

```typescript
export const TaskResultSchema = z.object({
  taskId: z.string().uuid(),

  status: z.enum(["completed", "failed", "timeout"]),

  result: z.object({
    // Output from the task
    output: z.string().optional(),
    // Exit code (for shell tasks)
    exitCode: z.number().optional(),
    // Structured data (for custom tasks)
    data: z.unknown().optional(),
  }).optional(),

  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),

  // Execution metadata
  execution: z.object({
    node: z.string(),
    startedAt: z.number(),
    completedAt: z.number(),
    duration: z.number(),
  }),
});

export type TaskResult = z.infer<typeof TaskResultSchema>;
```

**Example:**
```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result": {
    "output": "Hello, world!\n",
    "exitCode": 0
  },
  "execution": {
    "node": "macmini",
    "startedAt": 1704067200000,
    "completedAt": 1704067201234,
    "duration": 1234
  }
}
```

## Node Schemas

### NodeHeartbeat

Periodic heartbeat from compute nodes.

```typescript
export const NodeHeartbeatSchema = z.object({
  hostname: z.string(),

  type: z.enum(["hub", "compute", "mobile"]),

  tailscaleIp: z.string().ip(),

  capabilities: z.array(z.string()),

  status: z.object({
    load: z.number().min(0).max(1),
    memory: z.object({
      used: z.number(),
      total: z.number(),
    }),
    activeTasks: z.number(),
  }),
});

export type NodeHeartbeat = z.infer<typeof NodeHeartbeatSchema>;
```

**Example:**
```json
{
  "hostname": "macmini",
  "type": "compute",
  "tailscaleIp": "100.64.0.20",
  "capabilities": ["shell", "code", "build"],
  "status": {
    "load": 0.25,
    "memory": {
      "used": 4294967296,
      "total": 17179869184
    },
    "activeTasks": 2
  }
}
```

### NodeInfo

Node information returned from API.

```typescript
export const NodeInfoSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  type: z.enum(["hub", "compute", "mobile"]),
  tailscaleIp: z.string().ip(),
  capabilities: z.array(z.string()),
  status: z.enum(["online", "offline", "busy"]),
  lastSeen: z.number(),
});

export type NodeInfo = z.infer<typeof NodeInfoSchema>;
```

## Validation Helpers

### Validation Function

```typescript
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
```

### Error Formatting

```typescript
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}
```

### Usage Example

```typescript
import { ChatRequestSchema, validate, formatZodError } from "@mission-control/shared";

async function handleChat(req: Request): Promise<Response> {
  const body = await req.json();
  const validation = validate(ChatRequestSchema, body);

  if (!validation.success) {
    return new Response(JSON.stringify({
      error: "INVALID_REQUEST",
      message: formatZodError(validation.error),
      requestId: crypto.randomUUID(),
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Process validated request
  const { message, conversationId, intent } = validation.data;
  // ...
}
```

## Schema Evolution

When updating schemas:

1. **Add optional fields** - Safe, backwards compatible
2. **Make required fields optional** - Safe, backwards compatible
3. **Add new enum values** - Safe for response, requires client update for request
4. **Remove fields** - Breaking, requires version bump
5. **Change field types** - Breaking, requires version bump

Use versioned endpoints for breaking changes:
- `/v1/chat` - Current version
- `/v2/chat` - New version with breaking changes
