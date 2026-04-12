---
phase: 19-gbrain-integration
plan: 01
subsystem: gbrain
tags: [mcp, prefetch, cache, knowledge-graph]
dependency_graph:
  requires: []
  provides: [GbrainClient, prefetchGbrainContext, gbrainCache-table]
  affects: [operator-routes, db-schema]
tech_stack:
  added: ["@modelcontextprotocol/sdk"]
  patterns: [mcp-client-wrapper, fire-and-forget-prefetch, zod-response-validation]
key_files:
  created:
    - packages/api/src/gbrain/types.ts
    - packages/api/src/gbrain/client.ts
    - packages/api/src/gbrain/cache.ts
    - packages/api/src/gbrain/prefetch.ts
    - packages/api/src/__tests__/gbrain-client.test.ts
    - packages/api/src/__tests__/gbrain-prefetch.test.ts
  modified:
    - packages/api/src/db/schema.ts
    - packages/api/src/routes/operator.ts
    - packages/api/src/__tests__/helpers/test-db.ts
    - packages/api/package.json
decisions:
  - "MCP SDK Client + StdioClientTransport over SSH for gbrain connection"
  - "Zod validation on all gbrain responses for tampering mitigation (T-19-01)"
  - "Fire-and-forget prefetch in POST /request handler, never blocks response"
  - "Promise.allSettled for parallel search + entity detection"
  - "Entity type filtering (person, project, company, organization) with 3-entity cap"
metrics:
  duration: 5min
  completed: 2026-04-11
  tasks_completed: 2
  tasks_total: 2
  tests_added: 22
  files_created: 6
  files_modified: 4
---

# Phase 19 Plan 01: GbrainClient MCP Wrapper and Async Prefetch Summary

GbrainClient connects to gbrain MCP server over SSH via @modelcontextprotocol/sdk, with async prefetch at request submission caching results in Postgres gbrain_cache table.

## What Was Built

### Task 1: GbrainClient MCP wrapper and response types (c945e0a)
- **types.ts**: Zod schemas for GbrainSearchResult, GbrainEntity, GbrainRelated, GbrainCacheData with inferred TypeScript types
- **client.ts**: GbrainClient class using MCP SDK Client + StdioClientTransport over SSH. Maps design-doc operations to actual gbrain tools (query, get_page, traverse_graph). ConnectTimeout=5 prevents SSH hangs. Graceful degradation returns empty/null when not connected.
- **14 tests**: Connection success/failure, all three tool calls, disconnection, graceful degradation, Zod schema validation (valid + invalid)

### Task 2: Prefetch orchestrator, cache layer, schema, operator integration (1f8ad24)
- **schema.ts**: Added gbrainCache table (id, requestId, available, searchResults, entities, fetchedAt) with unique index on requestId
- **cache.ts**: cacheGbrainResult writes JSON-serialized gbrain data; getGbrainCache reads and parses back to typed objects
- **prefetch.ts**: prefetchGbrainContext orchestrator connects, runs search + entity detection via Promise.allSettled, caches results. detectAndFetchEntities filters for entity types, deduplicates slugs, caps at 3 entities. Never throws.
- **operator.ts**: Fire-and-forget `prefetchGbrainContext(id, whatNeeded, whatGood).catch(...)` after request insert, before clarification
- **test-db.ts**: Added gbrain_cache table DDL and cleanup to shared test infrastructure
- **8 tests**: Prefetch happy/degraded/error paths, cache CRUD, entity detection filtering and dedup

## Deviations from Plan

None -- plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-19-01 | Zod validation on all parsed gbrain responses in types.ts; malformed data returns empty results |
| T-19-02 | SSH command hardcoded in client.ts; request text passed as MCP tool arguments (JSON), never shell args |
| T-19-03 | ConnectTimeout=5 on SSH; GbrainClient.connect() timeout prevents pipeline blocking |
| T-19-04 | Prefetch is fire-and-forget (not awaited in operator route); pipeline never blocks on gbrain |
| T-19-05 | Accepted: warn-level logs for parse failures contain gbrain data (internal knowledge, not PII) |

## Verification

- 22 tests passing across 2 test files
- All acceptance criteria verified via grep checks
- gbrain_cache table added to Drizzle schema and test DB DDL
- prefetchGbrainContext integrated in operator POST /request route

## Self-Check: PASSED

All 6 created files exist. Both commits (c945e0a, 1f8ad24) verified in git log.
