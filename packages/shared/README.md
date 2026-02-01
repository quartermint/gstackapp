# Shared Package

Shared types, schemas, and utilities used across all Mission Control packages.

## Overview

This package provides:
- Zod schemas for API validation
- TypeScript type definitions
- Shared utilities and helpers
- Constants and configuration

## Installation

```bash
# From other packages
pnpm add @mission-control/shared

# Or workspace reference
"@mission-control/shared": "workspace:*"
```

## Usage

### Schemas

```typescript
import {
  ChatRequestSchema,
  ChatResponseSchema,
  TaskDispatchSchema,
  ErrorResponseSchema,
} from "@mission-control/shared";

// Validate request
const result = ChatRequestSchema.safeParse(body);
if (!result.success) {
  return error(result.error);
}

// Type-safe data
const { message, conversationId } = result.data;
```

### Types

```typescript
import type {
  ChatRequest,
  ChatResponse,
  TaskDispatch,
  TaskResult,
  NodeInfo,
  TrustLevel,
  AgentProfile,
} from "@mission-control/shared";

function handleChat(request: ChatRequest): ChatResponse {
  // ...
}
```

### Utilities

```typescript
import {
  validate,
  formatZodError,
  generateRequestId,
  sanitizeForLog,
} from "@mission-control/shared";

// Validate with helper
const validation = validate(ChatRequestSchema, body);
if (!validation.success) {
  console.error(formatZodError(validation.error));
}

// Generate IDs
const requestId = generateRequestId();

// Safe logging
const safeData = sanitizeForLog(sensitiveData);
```

### Constants

```typescript
import {
  TRUST_LEVELS,
  ERROR_CODES,
  MAX_MESSAGE_LENGTH,
  DEFAULT_TIMEOUT,
} from "@mission-control/shared";

if (message.length > MAX_MESSAGE_LENGTH) {
  throw new Error(ERROR_CODES.MESSAGE_TOO_LONG);
}
```

## Package Structure

```
src/
├── index.ts              # Main exports
├── schemas/
│   ├── chat.ts          # Chat schemas
│   ├── task.ts          # Task schemas
│   ├── node.ts          # Node schemas
│   └── error.ts         # Error schemas
├── types/
│   ├── agent.ts         # Agent types
│   ├── trust.ts         # Trust level types
│   └── common.ts        # Common types
├── utils/
│   ├── validation.ts    # Validation helpers
│   ├── id.ts            # ID generation
│   └── logging.ts       # Logging helpers
└── constants.ts         # Shared constants
```

## Exports

### Schemas (Zod)

| Schema | Description |
|--------|-------------|
| `ChatRequestSchema` | Chat request validation |
| `ChatResponseSchema` | Chat response validation |
| `TaskDispatchSchema` | Task dispatch validation |
| `TaskResultSchema` | Task result validation |
| `NodeHeartbeatSchema` | Node heartbeat validation |
| `NodeInfoSchema` | Node info validation |
| `ErrorResponseSchema` | Error response validation |

### Types (TypeScript)

| Type | Description |
|------|-------------|
| `ChatRequest` | Inferred from ChatRequestSchema |
| `ChatResponse` | Inferred from ChatResponseSchema |
| `TaskDispatch` | Inferred from TaskDispatchSchema |
| `TaskResult` | Inferred from TaskResultSchema |
| `NodeInfo` | Node information |
| `TrustLevel` | Trust level union |
| `AgentProfile` | Agent configuration |
| `ErrorCode` | Error code union |

### Utilities

| Function | Description |
|----------|-------------|
| `validate(schema, data)` | Safe schema validation |
| `formatZodError(error)` | Format Zod errors for display |
| `generateRequestId()` | Generate UUID v4 |
| `sanitizeForLog(data)` | Remove sensitive data for logging |
| `truncate(str, len)` | Truncate string with ellipsis |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `TRUST_LEVELS` | `["internal", "authenticated", "untrusted"]` | All trust levels |
| `MAX_MESSAGE_LENGTH` | `10000` | Max chat message length |
| `MAX_CODE_LENGTH` | `50000` | Max code execution length |
| `DEFAULT_TIMEOUT` | `30000` | Default request timeout (ms) |
| `MAX_TIMEOUT` | `600000` | Maximum timeout (ms) |

## Development

```bash
cd packages/shared

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build

# Type check
pnpm typecheck
```

## Publishing

The shared package is used via workspace references in the monorepo:

```json
{
  "dependencies": {
    "@mission-control/shared": "workspace:*"
  }
}
```

For external use, publish to npm:

```bash
pnpm publish --access public
```

## Version Compatibility

Keep the shared package version in sync across all packages. Use workspace protocol for internal consistency.

When making breaking changes:
1. Update major version
2. Update all dependent packages
3. Document migration path
