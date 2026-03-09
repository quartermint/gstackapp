# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mission Control is a personal operating environment -- an API-first platform that aggregates project data, captures raw thoughts, and surfaces contextual intelligence. It runs on a Mac Mini behind Tailscale. The dashboard is the first client; iOS, CLI, and MCP are future clients on the same API.

**Core value:** Every time you open Mission Control, you're smarter than you were 3 seconds ago.

## Architecture

```
Browser (React/Vite) -> Hono API (:3000) -> SQLite (better-sqlite3 + Drizzle ORM + FTS5)
                                          -> Project Scanner (git repos on disk)
                                          -> AI Enrichment (async categorization)
```

**API-first:** Dashboard, iOS, CLI, and MCP are all clients of the same Hono API.
**Single-user, trust-based:** No auth in v1. Tailscale network boundary is the access control.
**Persist first, enrich later:** Captures hit SQLite immediately, AI categorizes async.

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Development (all packages)
pnpm dev

# Single package dev
pnpm --filter @mission-control/api dev     # API on :3000
pnpm --filter @mission-control/web dev     # Web on :5173

# Type checking
pnpm typecheck

# Testing
pnpm test

# Build
pnpm build
```

## Package Structure

| Package | Port | Role |
|---------|------|------|
| `packages/api` | 3000 | Hono API server, SQLite database, project scanner |
| `packages/web` | 5173 (dev) | React + Vite dashboard, Tailwind CSS |
| `packages/shared` | - | Zod schemas, TypeScript types, shared utilities |

## Code Conventions

- **TypeScript strict mode** -- no `any` types, use `unknown`
- **Zod schemas** for all API boundaries (request validation, response shapes)
- **Naming**: files `kebab-case.ts`, types `PascalCase`, functions `camelCase`, constants `SCREAMING_SNAKE_CASE`
- **Typed errors**: `AppError` class with `code` and `status` properties
- **Conventional commits**: `feat(scope):`, `fix(scope):`, `chore(scope):`, etc.
- **Module system**: ESM (`"type": "module"`) throughout

## Testing

Test framework: Vitest. Run `pnpm test` for all packages.

## Configuration

Mission Control uses a config file (`mc.config.json`) for project registry. See `mc.config.example.json` for the shape. The config path can be overridden with `MC_CONFIG_PATH` env var.

## Database

SQLite via better-sqlite3 + Drizzle ORM. Database lives in `./data/` directory (gitignored). FTS5 virtual tables for full-text search.
