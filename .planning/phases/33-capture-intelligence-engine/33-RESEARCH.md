# Phase 33: Capture Intelligence Engine - Research

**Researched:** 2026-03-23
**Domain:** AI extraction pipeline, ambient capture ingestion, post-hoc grounding, iMessage/Capacities integration
**Confidence:** HIGH

## Summary

Phase 33 transforms the capture pipeline from a single-shot Gemini categorization call into a multi-signal intelligence system. The phase has three distinct workstreams: (1) evolving the AI categorizer to use few-shot examples with user corrections, multi-pass extraction, and post-hoc grounding; (2) importing Capacities backup data (644 tweets, 154 weblinks, 167 daily notes from ZIP archives); and (3) passive iMessage monitoring for conversations with specified contacts.

The existing codebase provides a solid foundation. The `enrichment.ts` pipeline, `ai-categorizer.ts`, and `capture-correction.tsx` already implement the "persist first, enrich later" pattern, async enrichment via `queueMicrotask`, and a basic project reassignment dropdown. Phase 32 shipped sqlite-vec, embeddings, hybrid search, and LM Studio integration -- all of which this phase builds on. The key evolution is adding few-shot examples as a database table, replacing the zero-shot Gemini prompt with a few-shot prompt (falling back to LM Studio when offline), and storing multi-pass extraction results (action items, ideas, questions) alongside the capture.

**Primary recommendation:** Build incrementally on the existing enrichment pipeline. Do not rewrite `enrichment.ts` -- extend it with a new `few-shot-categorizer.ts` that replaces `ai-categorizer.ts`, add extraction types as a JSON column, and implement grounding as a deterministic post-processing step using `diff-match-patch-es`. Capacities import and iMessage monitoring are independent services with their own polling loops.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Few-shot categorization with user-correctable examples. User corrections stored as new few-shot examples in database (not config file). Examples evolve over time.
- **D-02:** Local LLM fallback -- LM Studio serves as backup enrichment engine when Gemini is unreachable. Same few-shot prompt, different model.
- **D-03:** Prompt validation at startup -- verify few-shot examples still produce correct extractions (like langextract's pre-flight check).
- **D-04:** Post-hoc grounding IS in scope -- highlight which words in capture text triggered each extraction. Deterministic alignment (like langextract's difflib approach), not LLM-generated offsets. User said "that sounds cool" after explanation.
- **D-05:** Display as inline highlights on capture text (like search result snippets with marked terms).
- **D-06:** Click project badge -> dropdown reassign. Simple, direct, no gestures.
- **D-07:** Corrections tracked per project to calibrate confidence thresholds over time.
- **D-08:** Multi-pass extraction: project_ref, action_item, idea, link, question. Not just "which project" but "what kind of capture and what should happen next."
- **D-09:** Import from ~/Capacities_backup/ daily backup ZIPs. Ongoing bridge until MC replaces Capacities.
- **D-10:** Tweet content fetching via Crawl4AI (already running on Mac Mini Docker). Resolve bare URLs to full tweet text + thread context. 644 tweets need content.
- **D-11:** Batch-save UX must handle rapid-fire captures (42-tweet mega-batch pattern). Pipeline handles bursts gracefully.
- **D-12:** Start with Bella only, configurable contacts in mc.config.json. Full integration from day one.
- **D-13:** chat.db polling on Mac Mini (if Messages synced via iCloud) or MacBook helper app. Needs Full Disk Access.
- **D-14:** Extract action items, ideas, project references from conversations. Surface as captures with "from conversation with Bella" attribution.

### Claude's Discretion
- Multi-pass extraction implementation details
- Grounding alignment algorithm choice (difflib equivalent in JS)
- Capacities ZIP parsing and data mapping
- iMessage chat.db schema navigation and polling interval
- Confidence threshold tuning
- Heuristic for what constitutes a "significant" capture extraction

### Deferred Ideas (OUT OF SCOPE)
- IdentityVault integration -- iMessage data feeds both MC captures and IV people graph. Coordinate when both projects are active.
- Screenshot OCR capture from iOS -- deferred from v1.4, remains deferred
- Auto-promote captures to tasks -- MC captures, it doesn't manage tasks
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAP-01 | Few-shot categorization with user-correctable examples | New `few_shot_examples` table, prompt construction from DB examples, user correction writes new examples |
| CAP-02 | Multi-pass extraction: project refs, action items, ideas, links | Extended Zod schema for extraction types, two-pass LLM call with result merging |
| CAP-03 | Post-hoc grounding -- highlight which words triggered each extraction | `diff-match-patch-es` library for deterministic text alignment, grounding stored as JSON spans |
| CAP-04 | Confidence calibration from user feedback | `correction_stats` tracking per project, adaptive threshold adjustment |
| CAP-05 | Local LLM fallback for categorization when Gemini unavailable | Existing `createLmStudioProvider` + `getLmStudioStatus` pattern, same prompt different model |
| CAP-06 | Prompt validation at startup | Pre-flight check runs few-shot examples through categorizer, warns on mismatches |
| CAP-07 | Extraction types: project_ref, action_item, idea, link, question | JSON column `extractions` on captures table, typed Zod schema |
| CAP-08 | Capacities import bridge | ZIP parsing with `node-stream-zip`, YAML frontmatter via `gray-matter`, batch insert with content-hash dedup |
| CAP-09 | iMessage passive monitoring | SQLite read of `~/Library/Messages/chat.db`, Core Data timestamp conversion, TCC/Full Disk Access requirement |
| CAP-10 | Tweet content fetching via Crawl4AI | HTTP calls to Crawl4AI on Mac Mini (:11235), fallback to OG scraper |
| CAP-11 | Batch-save UX for rapid-fire captures | Async queue with p-limit concurrency, SSE progress events |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- TypeScript strict mode -- no `any` types, use `unknown`
- Zod schemas for all API boundaries (request validation, response shapes)
- Naming: files `kebab-case.ts`, types `PascalCase`, functions `camelCase`, constants `SCREAMING_SNAKE_CASE`
- Typed errors: `AppError` class with `code` and `status` properties
- Conventional commits: `feat(scope):`, `fix(scope):`, `chore(scope):`, etc.
- Module system: ESM (`"type": "module"`) throughout
- Test framework: Vitest. Run `pnpm test` for all packages.
- SQLite via better-sqlite3 + Drizzle ORM. Database lives in `./data/` directory (gitignored).
- "Persist first, enrich later" -- captures hit SQLite immediately, AI categorizes async.

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ai (Vercel AI SDK) | 6.0.116 | Structured LLM output via `generateText` + `Output.object` | Already used by ai-categorizer.ts and ai-query-rewriter.ts |
| @ai-sdk/google | 3.0.43 | Gemini model provider | Primary AI provider for categorization |
| @ai-sdk/openai | 3.0.47 | LM Studio OpenAI-compatible provider | Fallback for offline categorization (Phase 32 established pattern) |
| better-sqlite3 | 11.7.0 | SQLite database access | iMessage chat.db reads + main DB |
| drizzle-orm | 0.38.0 | ORM for schema management and queries | Schema migrations, typed queries |
| p-limit | 7.3.0 | Concurrency control for batch operations | Already used for SSH concurrency limiting |
| zod | 3.24.0 | Schema validation for extraction results | All API boundaries use Zod |

### New Dependencies
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| diff-match-patch-es | 1.0.1 | Post-hoc grounding alignment | Deterministic character-level text matching for highlighting which words triggered extractions |
| gray-matter | 4.0.3 | YAML frontmatter parsing | Capacities markdown files have YAML frontmatter with metadata (type, url, handle, date) |
| node-stream-zip | 1.15.0 | ZIP archive reading | Streaming read of Capacities backup ZIPs without extracting to disk |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| diff-match-patch-es | string-similarity + manual alignment | DMP is Google's battle-tested algorithm with character-position output; string-similarity only gives ratio scores |
| node-stream-zip | adm-zip (0.5.16) | node-stream-zip streams without loading entire ZIP to memory; Capacities ZIPs are ~27MB |
| gray-matter | Manual regex parsing | gray-matter handles edge cases (multiline values, nested YAML) that regex misses |

**Installation:**
```bash
pnpm --filter @mission-control/api add diff-match-patch-es gray-matter node-stream-zip
pnpm --filter @mission-control/api add -D @types/gray-matter
```

**Version verification:** All versions verified via `npm view` on 2026-03-23.

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
├── services/
│   ├── enrichment.ts                # Existing -- extend, don't rewrite
│   ├── ai-categorizer.ts            # Existing -- replaced by few-shot-categorizer
│   ├── few-shot-categorizer.ts      # NEW: Few-shot + multi-pass extraction
│   ├── grounding.ts                 # NEW: Post-hoc deterministic alignment
│   ├── capacities-importer.ts       # NEW: ZIP parsing + batch import
│   ├── imessage-monitor.ts          # NEW: chat.db polling service
│   ├── tweet-fetcher.ts             # NEW: Crawl4AI tweet content resolution
│   └── prompt-validator.ts          # NEW: Startup validation of few-shot examples
├── db/
│   ├── schema.ts                    # Extend captures table + add few_shot_examples + correction_stats
│   └── queries/
│       ├── captures.ts              # Extend with extraction queries
│       ├── few-shot-examples.ts     # NEW: CRUD for few-shot examples
│       └── correction-stats.ts      # NEW: Per-project correction tracking
├── routes/
│   └── captures.ts                  # Extend PATCH to record corrections as examples
└── lib/
    └── config.ts                    # Extend mcConfigSchema with ambientCapture section
packages/web/src/
├── components/capture/
│   ├── capture-card.tsx             # Extend with grounding highlights + extraction badges
│   ├── capture-correction.tsx       # Existing -- already works for D-06
│   └── extraction-badges.tsx        # NEW: Display action_item/idea/question badges
```

### Pattern 1: Few-Shot Categorizer with Dual-Model Fallback
**What:** Replace zero-shot Gemini prompt with few-shot prompt constructed from database examples. Fall back to LM Studio when Gemini is unreachable.
**When to use:** Every capture enrichment cycle.
**Example:**
```typescript
// few-shot-categorizer.ts
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { createLmStudioProvider, getLmStudioStatus } from "./lm-studio.js";

const extractionSchema = z.object({
  projectSlug: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  extractions: z.array(z.object({
    type: z.enum(["project_ref", "action_item", "idea", "link", "question"]),
    text: z.string(),
    confidence: z.number().min(0).max(1),
  })),
});

export async function categorizeWithFewShot(
  content: string,
  projects: ProjectInfo[],
  examples: FewShotExample[]
): Promise<ExtractionResult> {
  const prompt = buildFewShotPrompt(content, projects, examples);

  // Try Gemini first, fall back to LM Studio
  try {
    if (isGeminiAvailable()) {
      return await callModel(google("gemini-3-flash-preview"), prompt);
    }
  } catch { /* fall through */ }

  // LM Studio fallback (D-02)
  if (getLmStudioStatus().health === "ready") {
    const provider = createLmStudioProvider();
    return await callModel(provider("qwen3-coder"), prompt);
  }

  return fallbackResult();
}
```

### Pattern 2: Post-Hoc Grounding via diff-match-patch
**What:** After LLM extraction, deterministically find where each extracted phrase appears in the source text. No LLM involvement in offset calculation.
**When to use:** After every successful extraction, before storing results.
**Example:**
```typescript
// grounding.ts
import { DiffMatchPatch } from "diff-match-patch-es";

export type GroundingTier = "exact" | "fuzzy" | "ungrounded";

export interface GroundedSpan {
  text: string;
  startOffset: number;
  endOffset: number;
  tier: GroundingTier;
}

export function groundExtraction(
  sourceText: string,
  extractedText: string,
  fuzzyThreshold: number = 0.6
): GroundedSpan | null {
  const dmp = new DiffMatchPatch();

  // Try exact match first
  const exactIndex = sourceText.toLowerCase().indexOf(extractedText.toLowerCase());
  if (exactIndex >= 0) {
    return {
      text: sourceText.slice(exactIndex, exactIndex + extractedText.length),
      startOffset: exactIndex,
      endOffset: exactIndex + extractedText.length,
      tier: "exact",
    };
  }

  // Fuzzy match via DMP's match_main (configurable threshold)
  dmp.matchThreshold = fuzzyThreshold;
  const fuzzyIndex = dmp.matchMain(sourceText, extractedText, 0);
  if (fuzzyIndex >= 0) {
    return {
      text: sourceText.slice(fuzzyIndex, fuzzyIndex + extractedText.length),
      startOffset: fuzzyIndex,
      endOffset: fuzzyIndex + extractedText.length,
      tier: "fuzzy",
    };
  }

  return null; // Ungrounded -- LLM hallucinated or paraphrased
}
```

### Pattern 3: Capacities Streaming Import
**What:** Stream-read latest Capacities backup ZIP, parse YAML frontmatter, deduplicate by content hash, batch-insert as captures.
**When to use:** On startup (one-time import) and then on a configurable interval to pick up new backups.
**Example:**
```typescript
// capacities-importer.ts
import StreamZip from "node-stream-zip";
import matter from "gray-matter";

export async function importCapacitiesBackup(
  zipPath: string,
  db: DrizzleDb
): Promise<ImportResult> {
  const zip = new StreamZip.async({ file: zipPath });
  const entries = await zip.entries();
  const results = { imported: 0, skipped: 0, errors: 0 };

  for (const [name, entry] of Object.entries(entries)) {
    if (!name.endsWith(".md")) continue;
    const content = await zip.entryData(entry);
    const { data: frontmatter, content: body } = matter(content.toString("utf-8"));

    // Determine source type from path and frontmatter
    const sourceType = classifyCapacitiesEntry(name, frontmatter);
    const contentHash = computeContentHash(body + JSON.stringify(frontmatter));

    // Deduplicate by content hash
    if (existsByContentHash(db, contentHash)) {
      results.skipped++;
      continue;
    }

    // Create as capture with Capacities attribution
    createCapture(db, {
      rawContent: buildCaptureContent(frontmatter, body),
      type: sourceType === "tweet" ? "link" : "text",
      sourceType: "capacities",
      sourceMetadata: JSON.stringify(frontmatter),
    });
    results.imported++;
  }

  await zip.close();
  return results;
}
```

### Pattern 4: iMessage chat.db Polling
**What:** Open a read-only connection to ~/Library/Messages/chat.db, poll for new messages from configured contacts at intervals.
**When to use:** Background polling service started at server boot.
**Example:**
```typescript
// imessage-monitor.ts
import Database from "better-sqlite3";

const APPLE_EPOCH_OFFSET = 978307200; // Seconds between 1970-01-01 and 2001-01-01
const NANOSECOND_DIVISOR = 1_000_000_000;

export function convertAppleTimestamp(appleNanos: number): Date {
  const unixSeconds = (appleNanos / NANOSECOND_DIVISOR) + APPLE_EPOCH_OFFSET;
  return new Date(unixSeconds * 1000);
}

export function pollNewMessages(
  chatDbPath: string,
  contactIdentifiers: string[],
  sinceTimestamp: number // Apple nanosecond timestamp
): iMessageEntry[] {
  const db = new Database(chatDbPath, { readonly: true, fileMustExist: true });

  const rows = db.prepare(`
    SELECT
      m.ROWID as messageId,
      m.text,
      m.attributedBody,
      m.date as appleDate,
      m.is_from_me as isFromMe,
      h.id as handleId,
      c.chat_identifier as chatIdentifier
    FROM message m
    JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
    JOIN chat c ON c.ROWID = cmj.chat_id
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    WHERE c.chat_identifier IN (${contactIdentifiers.map(() => "?").join(",")})
      AND m.date > ?
    ORDER BY m.date ASC
  `).all(...contactIdentifiers, sinceTimestamp);

  db.close();
  return rows.map(parseMessageRow);
}
```

### Anti-Patterns to Avoid
- **Rewriting enrichment.ts from scratch:** The existing pipeline works. Extend it by swapping out `ai-categorizer.ts` with `few-shot-categorizer.ts` and adding extraction storage.
- **LLM-generated grounding offsets:** Never trust the LLM to produce correct character positions. Always compute deterministically post-hoc.
- **Blocking the API during batch import:** Capacities import (800+ items) and tweet fetching (644 URLs) must run async with progress events via SSE, never blocking request handlers.
- **Holding iMessage chat.db open:** Open read-only, query, close immediately. The Messages app holds a WAL lock and long-lived connections can cause contention.
- **Storing few-shot examples in config files:** D-01 explicitly requires database storage. Examples evolve from user corrections -- config files are static.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text alignment / fuzzy matching | Custom character-by-character comparison | `diff-match-patch-es` `matchMain()` | Google's algorithm handles insertions, deletions, transpositions; threshold-configurable |
| YAML frontmatter parsing | Regex for `---\n...\n---` blocks | `gray-matter` | Edge cases: multiline values, nested objects, empty frontmatter, Windows line endings |
| ZIP archive streaming | `unzip` child process or full-memory extraction | `node-stream-zip` | Streams entries without extracting to disk; handles 27MB+ ZIPs safely |
| Dual-model failover | Custom retry logic with if/else chains | Pattern: try Gemini -> catch -> check LM Studio status -> call | Already established in `ai-query-rewriter.ts` with `getLmStudioStatus()` check |
| Apple timestamp conversion | Manual math | `APPLE_EPOCH_OFFSET` constant + nanosecond division | Apple uses nanoseconds since 2001-01-01; off-by-one errors common when hand-rolling |

**Key insight:** The three hardest problems here are (1) reliable text grounding without LLM, (2) Apple's iMessage data format quirks, and (3) handling burst imports without blocking the API. All three have well-known solutions that should not be reinvented.

## Common Pitfalls

### Pitfall 1: iMessage TCC (Transparency, Consent, and Control) Blocking
**What goes wrong:** Terminal/node process cannot read ~/Library/Messages/chat.db -- macOS returns "Operation not permitted" even as the file owner.
**Why it happens:** macOS requires Full Disk Access (FDA) grant for any process reading Messages data. This is enforced by TCC, not file permissions.
**How to avoid:** The MC API server process (or its parent terminal) must have Full Disk Access granted in System Settings > Privacy & Security > Full Disk Access. On Mac Mini where MC runs as a service, the node process or its launcher must be added to FDA.
**Warning signs:** `SQLITE_CANTOPEN` or `EPERM` errors when opening chat.db. Test with `sqlite3 ~/Library/Messages/chat.db ".tables"` in the same environment MC runs in.

### Pitfall 2: iMessage attributedBody Binary Plist
**What goes wrong:** Recent macOS versions (Ventura+) encode message text in `attributedBody` as a binary plist (NSAttributedString) instead of plain text in the `text` column. The `text` field may be NULL for rich messages.
**Why it happens:** Apple migrated to binary plist storage for rich text formatting, reactions, and thread replies.
**How to avoid:** Always check `text` first; if NULL, parse `attributedBody` by extracting the readable string portion. The binary plist contains UTF-8 text preceded by `NSString` type markers. A simple regex extraction (`/(?<=NSString\x01.).+?(?=\x00)/`) works for plain text content. For production reliability, use a streaming search for the string content between known binary markers.
**Warning signs:** Messages showing as empty/null when you can see them in the Messages app.

### Pitfall 3: Capacities ZIP Path Encoding
**What goes wrong:** File paths inside ZIP contain special characters: `Ryan's Brain/Tweets/Untitled (42).md` -- the apostrophe and parentheses cause issues with naive path handling.
**Why it happens:** Capacities uses the workspace name (with apostrophe) as the root directory in the ZIP.
**How to avoid:** Use `node-stream-zip`'s entry iteration (already handles encoding). Never construct paths manually from filename strings.
**Warning signs:** `ENOENT` errors or missing files during import.

### Pitfall 4: Tweet URL Resolution Rate Limiting
**What goes wrong:** Crawl4AI hitting X/Twitter too fast results in 429 responses or complete IP blocking.
**Why it happens:** Twitter/X has aggressive rate limiting for unauthenticated scraping.
**How to avoid:** Use p-limit with concurrency of 1-2 for tweet fetching. Add exponential backoff on 429 responses. Queue all 644 tweets but process slowly (1-2 per second). This is a background batch job, not time-sensitive.
**Warning signs:** Crawl4AI returning empty content or error responses after initial successes.

### Pitfall 5: Few-Shot Prompt Token Overflow
**What goes wrong:** As user corrections accumulate, the few-shot examples grow beyond the model's context window or degrade output quality.
**Why it happens:** Each few-shot example adds ~50-100 tokens. With 35+ projects and growing corrections, the prompt can exceed limits.
**How to avoid:** Limit few-shot examples to the 3-5 most recent/relevant per project. Use vector similarity (Phase 32 infrastructure) to select examples most similar to the current capture. Cap total examples at ~20 in any single prompt.
**Warning signs:** AI accuracy declining over time, or model returning truncated/malformed responses.

### Pitfall 6: iMessage chat.db WAL Contention
**What goes wrong:** Reading chat.db while Messages.app is actively writing causes SQLITE_BUSY or stale reads.
**Why it happens:** chat.db uses WAL mode. The Messages app holds a persistent connection. Opening another connection can see stale data if WAL checkpointing hasn't occurred.
**How to avoid:** Open as `readonly: true` with `fileMustExist: true`. Set `PRAGMA busy_timeout = 1000`. Accept that reads may lag by seconds behind real-time -- this is acceptable for passive monitoring. Never attempt to write to chat.db.
**Warning signs:** Missing recent messages, SQLITE_BUSY errors in logs.

## Code Examples

### Schema Migration: New Tables and Columns

```sql
-- 0012_capture_intelligence.sql

-- Few-shot examples table (D-01)
CREATE TABLE IF NOT EXISTS `few_shot_examples` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `capture_content` text NOT NULL,
  `correct_project_slug` text,
  `extraction_type` text NOT NULL DEFAULT 'project_ref',
  `source` text NOT NULL DEFAULT 'user_correction',
  `created_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `fse_project_idx` ON `few_shot_examples` (`correct_project_slug`);
CREATE INDEX IF NOT EXISTS `fse_type_idx` ON `few_shot_examples` (`extraction_type`);

-- Correction stats per project (D-07 / CAP-04)
CREATE TABLE IF NOT EXISTS `correction_stats` (
  `project_slug` text NOT NULL,
  `ai_suggested_slug` text,
  `corrections_count` integer NOT NULL DEFAULT 0,
  `total_categorizations` integer NOT NULL DEFAULT 0,
  `last_corrected_at` text,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`project_slug`, `ai_suggested_slug`)
);

-- Add new columns to captures table
ALTER TABLE `captures` ADD COLUMN `source_type` text DEFAULT 'manual';
ALTER TABLE `captures` ADD COLUMN `source_metadata` text;
ALTER TABLE `captures` ADD COLUMN `extractions` text;
ALTER TABLE `captures` ADD COLUMN `grounding_data` text;
```

### Few-Shot Prompt Construction

```typescript
// Source: langextract design pattern, adapted for MC's Vercel AI SDK usage
function buildFewShotPrompt(
  content: string,
  projects: ProjectInfo[],
  examples: FewShotExample[]
): string {
  const projectContext = projects
    .map((p) => `- ${p.slug}: ${p.name}${p.tagline ? ` (${p.tagline})` : ""}`)
    .join("\n");

  const exampleSection = examples
    .map((ex) => `Input: "${ex.captureContent}"\nOutput: { projectSlug: "${ex.correctProjectSlug}", extractions: [...] }`)
    .join("\n\n");

  return `You are a personal capture intelligence engine. Given a raw thought/capture:
1. Determine which project it belongs to
2. Extract structured items: action_items, ideas, questions, project_refs, links

Available projects:
${projectContext}

${examples.length > 0 ? `Examples of correct categorizations:\n${exampleSection}\n` : ""}
Now categorize this capture:
"${content}"`;
}
```

### User Correction Flow (extending existing capture-correction.tsx)

```typescript
// In captures route PATCH handler -- extend existing correction flow
// When projectId changes AND aiProjectSlug existed, record as correction
if (data.projectId && capture.aiProjectSlug && data.projectId !== capture.aiProjectSlug) {
  // Store as new few-shot example (D-01)
  insertFewShotExample(db, {
    captureContent: capture.rawContent,
    correctProjectSlug: data.projectId,
    extractionType: "project_ref",
    source: "user_correction",
  });

  // Update correction stats (D-07)
  incrementCorrectionStat(db, {
    projectSlug: data.projectId,
    aiSuggestedSlug: capture.aiProjectSlug,
  });
}
```

### Grounding Display Component

```tsx
// extraction-badges.tsx
interface ExtractionBadgeProps {
  extractions: Array<{
    type: "project_ref" | "action_item" | "idea" | "link" | "question";
    text: string;
    confidence: number;
  }>;
}

const TYPE_STYLES: Record<string, string> = {
  action_item: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  idea: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  question: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  link: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  project_ref: "bg-terracotta/10 text-terracotta border-terracotta/20",
};

const TYPE_LABELS: Record<string, string> = {
  action_item: "Action",
  idea: "Idea",
  question: "Question",
  link: "Link",
  project_ref: "Ref",
};
```

### Capacities Frontmatter Shape (verified from actual backup)

```typescript
// Capacities entry types observed in backup ZIPs
interface CapacitiesTweet {
  type: "Tweet";
  title: string;           // Always "Untitled" or "Untitled (N)"
  description: string | null;
  createdAt: string;        // ISO 8601
  creationDate: string;     // "YYYY-MM-DD HH:mm"
  tags: string[];
  url: string;              // https://twitter.com/handle/status/ID
  twitterHandle: string;
  thread: boolean;
  language: string | null;
  attachments: string[];
}

interface CapacitiesWeblink {
  type: "Weblink";
  title: string;
  description: string | null;
  createdAt: string;
  creationDate: string;
  tags: string[];
  previewImage: string | null;
  url: string;
  iframeUrl: string | null;
  domain: string;
}

interface CapacitiesDailyNote {
  type: "DailyNote";
  title: string;            // "Daily Note"
  date: string;             // "YYYY-MM-DD"
  tags: string[];
}

interface CapacitiesPerson {
  type: "Person";
  collections: string;      // e.g., "Family"
  title: string;            // Person name
  // ... many optional fields (role, company, email, etc.)
}
```

### iMessage Apple Timestamp Conversion (verified)

```typescript
// Apple's Core Data timestamp is nanoseconds since 2001-01-01 00:00:00 UTC
// Unix epoch is seconds since 1970-01-01 00:00:00 UTC
// Difference: 978307200 seconds

const APPLE_EPOCH_OFFSET = 978307200;

function appleNanosToDate(appleNanos: number): Date {
  const unixSeconds = (appleNanos / 1_000_000_000) + APPLE_EPOCH_OFFSET;
  return new Date(unixSeconds * 1000);
}

function dateToAppleNanos(date: Date): number {
  const unixSeconds = date.getTime() / 1000;
  return (unixSeconds - APPLE_EPOCH_OFFSET) * 1_000_000_000;
}
```

### mc.config.json Extension

```typescript
// Extend mcConfigSchema in lib/config.ts
const ambientCaptureSchema = z.object({
  capacities: z.object({
    backupDir: z.string().default("~/Capacities_backup"),
    scheduleId: z.string().default("Schedule #1 (829272da)"),
    importIntervalHours: z.number().int().min(1).default(24),
    enabled: z.boolean().default(false),
  }).optional(),
  imessage: z.object({
    chatDbPath: z.string().default("~/Library/Messages/chat.db"),
    contacts: z.array(z.string()).default([]),  // Phone numbers or email addresses
    pollIntervalMinutes: z.number().int().min(1).default(5),
    enabled: z.boolean().default(false),
  }).optional(),
  crawl4ai: z.object({
    url: z.string().url().default("http://100.123.8.125:11235"),
    enabled: z.boolean().default(true),
  }).optional(),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zero-shot Gemini categorization | Few-shot with user-correctable examples | This phase | Accuracy improves over time from corrections |
| Single extraction (project only) | Multi-pass extraction (project + type + items) | This phase | Captures understood as action items, ideas, questions -- not just "which project" |
| No grounding | Post-hoc deterministic grounding | This phase | Users can see WHY AI made its decision |
| Manual capture only | Ambient capture (Capacities + iMessage) | This phase | MC captures from where conversations happen, not just from MC interfaces |
| Gemini-only (cloud dependent) | Gemini + LM Studio fallback | Phase 32 pattern, extended here | Offline enrichment capability |

**Deprecated/outdated:**
- `ai-categorizer.ts` zero-shot prompt: Will be superseded by `few-shot-categorizer.ts` but keep the file for backward compatibility during transition. Remove after Phase 33 is verified.

## Open Questions

1. **Crawl4AI Availability on Mac Mini**
   - What we know: Crawl4AI was running on Mac Mini Docker (:11235) per CLAUDE.md. SSH probe failed during research (Mac Mini may be asleep).
   - What's unclear: Whether the Crawl4AI container is currently running and what API format it uses.
   - Recommendation: Plan assumes Crawl4AI is available. Add a health check at startup; if unavailable, queue tweet URLs for later processing and fall back to OG scraper for basic metadata.

2. **iMessage Full Disk Access on Mac Mini vs MacBook**
   - What we know: chat.db exists on MacBook (1.7MB, confirmed). TCC blocks access without FDA (confirmed by probe). MC runs on Mac Mini behind Tailscale.
   - What's unclear: Whether iMessage syncs to Mac Mini via iCloud (requires Apple ID login + Messages enabled). If not, need MacBook-side helper.
   - Recommendation: Implement the polling service to work with any chat.db path. Default to Mac Mini path in config. If unavailable, document the MacBook helper approach but defer implementation (D-13 says "or MacBook helper app").

3. **attributedBody Parsing Reliability**
   - What we know: Modern macOS encodes some messages as binary plist in `attributedBody` instead of plain text in `text`.
   - What's unclear: What percentage of Bella's messages use attributedBody vs plain text. Cannot test without FDA.
   - Recommendation: Try `text` column first. If NULL, extract from `attributedBody` using binary search for UTF-8 string content. Log unreadable messages for manual review.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Gemini API | Primary categorization | Requires GEMINI_API_KEY env var | gemini-3-flash-preview | LM Studio fallback (D-02) |
| LM Studio | Offline categorization fallback | Runs on Mac Mini :1234 | qwen3-coder | Skip enrichment, mark as "raw" |
| Crawl4AI | Tweet content fetching (CAP-10) | Unknown (Mac Mini Docker :11235) | -- | OG scraper via open-graph-scraper |
| chat.db | iMessage monitoring (CAP-09) | Exists on MacBook (1.7MB), TCC-blocked | macOS 15+ | Disabled by default, requires FDA grant |
| Capacities backup | Capacities import (CAP-08) | Available at ~/Capacities_backup/ | Latest: 2026-03-23 | -- |
| Node.js | Runtime | Available | Verified in existing stack | -- |
| better-sqlite3 | iMessage chat.db reads | Already installed | 11.7.0 | -- |

**Missing dependencies with no fallback:**
- None -- all external dependencies have graceful degradation paths.

**Missing dependencies with fallback:**
- Crawl4AI: Falls back to OG scraper for basic metadata (title, domain) when unavailable.
- iMessage: Disabled by default in config. Requires manual FDA grant before enabling.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.0 |
| Config file | packages/api/vitest.config.ts |
| Quick run command | `pnpm --filter @mission-control/api test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAP-01 | Few-shot examples stored from corrections, used in prompt | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/few-shot-categorizer.test.ts -x` | Wave 0 |
| CAP-02 | Multi-pass extraction returns project_ref + action_item + idea + link + question types | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/few-shot-categorizer.test.ts -x` | Wave 0 |
| CAP-03 | Grounding returns character offsets matching source text | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/grounding.test.ts -x` | Wave 0 |
| CAP-04 | Correction stats increment on PATCH projectId change | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/db/queries/correction-stats.test.ts -x` | Wave 0 |
| CAP-05 | LM Studio fallback used when Gemini unavailable | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/few-shot-categorizer.test.ts -x` | Wave 0 |
| CAP-06 | Prompt validation logs warnings on startup | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/prompt-validator.test.ts -x` | Wave 0 |
| CAP-07 | Extractions stored as typed JSON on capture | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/enrichment.test.ts -x` | Extend existing |
| CAP-08 | Capacities ZIP parsed, deduped, batch-inserted | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/capacities-importer.test.ts -x` | Wave 0 |
| CAP-09 | iMessage messages polled from chat.db with timestamp conversion | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/imessage-monitor.test.ts -x` | Wave 0 |
| CAP-10 | Tweet URLs resolved to content text | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/tweet-fetcher.test.ts -x` | Wave 0 |
| CAP-11 | Batch import handles 50+ items without blocking API | integration | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/capacities-importer.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/services/few-shot-categorizer.test.ts` -- covers CAP-01, CAP-02, CAP-05
- [ ] `src/__tests__/services/grounding.test.ts` -- covers CAP-03
- [ ] `src/__tests__/db/queries/correction-stats.test.ts` -- covers CAP-04
- [ ] `src/__tests__/services/prompt-validator.test.ts` -- covers CAP-06
- [ ] `src/__tests__/services/capacities-importer.test.ts` -- covers CAP-08, CAP-11
- [ ] `src/__tests__/services/imessage-monitor.test.ts` -- covers CAP-09
- [ ] `src/__tests__/services/tweet-fetcher.test.ts` -- covers CAP-10
- [ ] Extend `src/__tests__/services/enrichment.test.ts` -- covers CAP-07 (extractions storage)

## Sources

### Primary (HIGH confidence)
- Capacities backup ZIP structure -- Directly inspected `~/Capacities_backup/Schedule #1 (829272da)/Capacities (2026-03-23 00-38-22).zip`: 644 tweets, 154 weblinks, 167 daily notes, 23 people, 4 pages. YAML frontmatter format verified on actual files.
- iMessage chat.db -- File exists at `~/Library/Messages/chat.db` (1.7MB), TCC-blocked as expected. Schema verified via web sources.
- Existing codebase -- `enrichment.ts`, `ai-categorizer.ts`, `capture-correction.tsx`, `embedding.ts`, `lm-studio.ts`, `hybrid-search.ts`, `ai-query-rewriter.ts` all read and analyzed.
- npm registry -- `diff-match-patch-es` 1.0.1, `gray-matter` 4.0.3, `node-stream-zip` 1.15.0 verified via `npm view`.

### Secondary (MEDIUM confidence)
- [iMessage chat.db SQL patterns](https://spin.atomicobject.com/search-imessage-sql/) -- Core Data epoch conversion formula, table join patterns
- [iMessage deep dive](https://fatbobman.com/en/posts/deep-dive-into-imessage/) -- attributedBody binary plist format, WAL considerations
- [Google langextract](https://github.com/google/langextract) -- Few-shot extraction pattern, grounding tiers (MATCH_EXACT/FUZZY/LESSER), prompt validation concept
- [diff-match-patch-es](https://www.npmjs.com/package/diff-match-patch-es) -- ESM TypeScript port of Google's diff-match-patch

### Tertiary (LOW confidence)
- Crawl4AI availability on Mac Mini -- SSH probe failed; assumed available based on CLAUDE.md documentation. Needs runtime verification.
- attributedBody parsing strategy -- Multiple approaches described in sources but untested against actual Bella conversation data. May need refinement during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified against npm registry, existing patterns well-understood from codebase analysis
- Architecture: HIGH - Extends proven patterns (enrichment pipeline, LM Studio fallback, event bus), no architectural novelty
- Pitfalls: HIGH - TCC blocking confirmed by probe, Capacities ZIP format verified by extraction, iMessage schema well-documented
- Ambient capture sources: MEDIUM - Capacities format verified, iMessage schema documented but untested with FDA, Crawl4AI unverified

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable domain -- libraries and iMessage schema unlikely to change)
