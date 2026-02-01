# Contributing to Mission Control

This document covers development setup, code standards, and the contribution process.

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 8+
- Tailscale installed and authenticated
- Access to Convex project

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/mission-control.git
cd mission-control

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env.local

# Configure your environment
# Edit .env.local with your credentials
```

### Environment Variables

```bash
# .env.local
CONVEX_DEPLOYMENT=your-deployment-name
TAILSCALE_AUTHKEY=tskey-xxxxx
CLAUDE_API_KEY=sk-ant-xxxxx  # For local testing only
```

### Running Locally

```bash
# Start Convex dev server
pnpm convex dev

# In another terminal, start the hub
pnpm --filter hub dev

# In another terminal, start the worker (local mode)
pnpm --filter worker dev
```

## Code Standards

### TypeScript

- Use strict mode
- Explicit return types for functions
- No `any` types (use `unknown` if needed)
- Zod schemas for all external boundaries

```typescript
// Good
function processRequest(req: ChatRequest): ChatResponse {
  // ...
}

// Bad
function processRequest(req: any) {
  // ...
}
```

### File Organization

```
packages/hub/src/
├── index.ts          # Entry point
├── server.ts         # HTTP server setup
├── routes/           # Route handlers
├── services/         # Business logic
├── utils/            # Helpers
└── types.ts          # Type definitions
```

### Naming Conventions

- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions/Variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

### Error Handling

Always use typed errors:

```typescript
class SecurityError extends Error {
  constructor(
    public code: SecurityErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SecurityError";
  }
}

// Usage
throw new SecurityError("INJECTION_DETECTED", "Blocked suspicious input");
```

### Testing

- Unit tests for business logic
- Integration tests for API endpoints
- Security tests for input validation

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter hub test

# Run with coverage
pnpm test:coverage
```

## Git Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `security/description` - Security improvements
- `docs/description` - Documentation updates

### Commit Messages

Follow conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `security`

Examples:
```
feat(hub): add input sanitization pipeline
fix(worker): correct rate limiting window
security(compute): restrict command allowlist
docs(readme): update architecture diagram
```

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure all tests pass: `pnpm test`
4. Ensure linting passes: `pnpm lint`
5. Create PR with description using the template
6. Request review
7. Address feedback
8. Squash and merge when approved

## Security Guidelines

### Secrets

- Never commit secrets to the repository
- Use environment variables
- Rotate credentials regularly

### Dependencies

- Review new dependencies before adding
- Keep dependencies updated
- Run `pnpm audit` regularly

### Code Review

Security-sensitive changes require:
- Review from security-aware maintainer
- Explicit security testing
- Documentation of security implications

## Documentation

### Code Comments

- Document "why", not "what"
- Keep comments up to date
- Use JSDoc for public APIs

```typescript
/**
 * Validates and sanitizes user input for injection patterns.
 *
 * @param message - Raw user message
 * @returns Sanitized message or error if blocked
 * @throws Never throws, returns error result instead
 */
function sanitizeInput(message: string): SanitizeResult {
  // ...
}
```

### Architecture Decisions

For significant changes, create an ADR (Architecture Decision Record):

```markdown
# ADR-001: Use Zod for Schema Validation

## Status
Accepted

## Context
We need runtime validation at API boundaries.

## Decision
Use Zod for schema validation.

## Consequences
- Type-safe validation
- Good DX with inference
- Adds ~15KB to bundle
```

## Getting Help

- Check existing issues and discussions
- Ask in the development channel
- Create an issue for bugs or feature requests

## Recognition

Contributors are recognized in release notes. Thank you for helping improve Mission Control!
