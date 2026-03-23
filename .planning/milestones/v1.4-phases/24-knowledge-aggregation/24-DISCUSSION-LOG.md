# Phase 24: Knowledge Aggregation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-21
**Phase:** 24-knowledge-aggregation
**Areas discussed:** Parse depth, API shape

---

## Parse Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Raw text (Recommended) | Store full markdown as-is. Convention scanner pattern-matches against raw text. MCP tools return raw content — Claude interprets structure naturally. | ✓ |
| Structured parse | Extract sections (overview, commands, conventions) into normalized JSON columns. Richer API queries but fragile parsing and more schema maintenance. | |
| Hybrid | Store raw text AND extract key sections as metadata. Best queryability but doubled storage and parsing complexity. | |

**User's choice:** Raw text
**Notes:** Simple approach — let Claude interpret structure when queried via MCP.

---

## API Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Content + metadata (Recommended) | Return raw CLAUDE.md content plus metadata: contentHash, lastModified, fileSize, staleness score. Dashboard shows freshness, MCP returns the content. | ✓ |
| Content only | Just the raw markdown text. Minimal API surface, clients derive what they need. | |
| Content + sections index | Raw content plus a table of contents (section headings + line numbers). Helps MCP tools reference specific sections. | |

**User's choice:** Content + metadata
**Notes:** Metadata envelope supports dashboard freshness display and staleness detection.

---

## Claude's Discretion

- Knowledge table schema design
- Content hash algorithm
- Staleness score formula
- SSH connection strategy

## Deferred Ideas

None
