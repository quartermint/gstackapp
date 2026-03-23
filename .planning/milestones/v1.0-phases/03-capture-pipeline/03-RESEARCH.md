# Phase 3: Capture Pipeline - Research

**Researched:** 2026-03-09
**Domain:** Zero-friction capture UI, AI text categorization, command palette, URL metadata extraction
**Confidence:** HIGH

## Summary

Phase 3 builds the core capture experience: an always-visible text field, AI-powered project categorization, a command palette (Cmd+K), and stale capture triage. The existing codebase already has full CRUD API for captures, Zod schemas, FTS5 search, and a status lifecycle (`raw -> pending_enrichment -> enriched -> archived`). The API layer is ready; this phase is primarily a frontend build + an AI enrichment service on the backend.

The key technical decisions are: (1) use cmdk v1.1.1 for the command palette (unstyled, React 19 compatible since v1.0.4, powers Linear/Raycast), (2) use Vercel AI SDK (`ai` package) with `generateText` + `Output.object()` for provider-agnostic structured AI categorization (swap OpenAI/Anthropic without code changes), (3) use `open-graph-scraper` for link metadata extraction, and (4) extend the captures DB schema with columns for AI confidence, link metadata, and enrichment timestamps.

**Primary recommendation:** Build capture UI components first (field, palette, keyboard shortcuts), then wire the AI enrichment service, then add captures-on-project-cards and stale triage -- this follows the existing "persist first, enrich later" architecture.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Always-visible text field at top of dashboard, above hero card
- Single-line input that grows to 3-4 lines max as user types past one line
- Enter submits, Shift+Enter for newline
- After submit: field does NOT clear -- cursor stays, ready for next thought (rapid-fire stacking)
- Placeholder: "What's on your mind..." or similar
- Auto-detect URLs in capture input, extract title/description async
- Display as rich link card on project card (title, domain, snippet)
- Raw URL preserved if metadata extraction fails
- Command palette: Spotlight-style overlay, default mode is capture
- Prefix-based mode switching: '/' for commands/navigation, '?' for search
- When opened with no input: show 5 recent projects and 3 recent captures
- Minimal keyboard shortcuts: Cmd+K (palette), '/' (focus capture field), Esc (close/blur)
- Quiet AI assignment -- no confidence score visible to user
- Below-threshold captures go to "loose thoughts" instead of project cards
- No confirmation step -- trust the system, correct when wrong
- Correction: click project badge on capture, dropdown of all projects, select or "Unlink"
- Loose thoughts section below departure board, smaller visual treatment
- Stale triage: periodic session model, badge count for 2+ week old captures
- Triage view: one capture at a time, actions: act, archive, dismiss

### Claude's Discretion
- How captures appear on project cards (inline list, expandable section, count badge with expand)
- AI confidence threshold for project assignment vs "loose thoughts"
- AI model/provider selection for categorization
- Link metadata extraction approach
- Triage view design details
- Command palette animation/transition style
- How "recent projects + captures" suggestions are ranked in palette

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CAPT-01 | User can type a raw thought and submit in under 3 seconds | Auto-growing textarea pattern, optimistic UI with useOptimistic, POST /api/captures already exists |
| CAPT-02 | AI auto-categorizes capture to project with confidence score | AI SDK generateText + Output.object() with Zod schema, project slugs from GET /api/projects |
| CAPT-03 | User can correct AI's project assignment with one click | PATCH /api/captures/:id with projectId update, dropdown populated from project list |
| CAPT-04 | Captures appear woven into project cards | New capture count/list on project rows, fetched via GET /api/captures?projectId=xxx |
| CAPT-05 | Unlinked captures in "loose thoughts" section | Filter captures where projectId is null, new LooseThoughts component below DepartureBoard |
| CAPT-06 | Captures persisted immediately on submission | Existing POST /api/captures persists with status "raw", enrichment is separate async step |
| CAPT-07 | AI triage surfaces captures older than 2 weeks | Query captures WHERE created_at < NOW - 14 days AND status != 'archived', new triage view component |
| CAPT-08 | Archived captures removed from cards but remain searchable | PATCH status to "archived", filter out in card queries, FTS5 still indexes archived captures |
| CAPT-09 | Captures support text, URLs, and link metadata | URL detection regex, open-graph-scraper for server-side metadata extraction, new DB columns for link metadata |
| INTR-01 | Command palette (Cmd+K) for capture, navigation, search | cmdk v1.1.1 library, unstyled, Tailwind-compatible, multi-mode via prefix detection |
| INTR-02 | Keyboard shortcuts for capture field, navigation, hero toggle, search | Global keydown listener, minimal set per CONTEXT.md |
| INTR-03 | Hybrid interaction: keyboard for power actions, mouse for browsing | cmdk handles keyboard nav, existing click handlers on project rows preserved |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| cmdk | 1.1.1 | Command palette | Unstyled, React 19 compatible (since v1.0.4), powers Linear/Raycast, battle-tested fuzzy search |
| ai (Vercel AI SDK) | 6.x | AI categorization | Provider-agnostic (OpenAI/Anthropic), Zod schema support, generateText + Output.object() |
| @ai-sdk/openai | latest | OpenAI provider | Default provider for categorization (cheap, fast with gpt-4o-mini) |
| @ai-sdk/anthropic | latest | Anthropic provider | Alternative provider, swap via env var |
| open-graph-scraper | 6.11.x | Link metadata extraction | Mature, TypeScript types, uses Fetch API, no Puppeteer needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-textarea-autosize | 8.5.x | Auto-growing textarea | For the capture input field that grows from 1 to 3-4 lines |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| cmdk | Custom implementation | cmdk saves weeks of keyboard nav, fuzzy search, a11y work |
| AI SDK | Direct OpenAI/Anthropic SDK | AI SDK abstracts provider, but adds a dependency layer |
| react-textarea-autosize | Custom CSS grid trick | Library handles edge cases (SSR, reflow, max rows) better |
| open-graph-scraper | Custom fetch + cheerio | OGS handles fallbacks, edge cases, timeout; custom is fragile |

**Installation:**
```bash
# API package
cd packages/api && pnpm add ai @ai-sdk/openai @ai-sdk/anthropic open-graph-scraper

# Web package
cd packages/web && pnpm add cmdk react-textarea-autosize
```

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
├── services/
│   ├── enrichment.ts         # AI categorization + link metadata orchestrator
│   ├── ai-categorizer.ts     # AI SDK generateText wrapper
│   └── link-extractor.ts     # open-graph-scraper wrapper
├── routes/
│   ├── captures.ts           # (existing) - extend with enrichment trigger
│   └── enrichment.ts         # (new) - manual re-enrichment endpoint
├── db/
│   ├── schema.ts             # (extend) - add confidence, linkMeta columns
│   └── queries/captures.ts   # (extend) - stale capture queries

packages/web/src/
├── components/
│   ├── capture/
│   │   ├── capture-field.tsx       # Always-visible auto-growing input
│   │   ├── capture-card.tsx        # Single capture display on project cards
│   │   └── capture-correction.tsx  # Project reassignment dropdown
│   ├── command-palette/
│   │   ├── command-palette.tsx     # cmdk wrapper with mode switching
│   │   └── palette-items.tsx       # Grouped command/navigation/search items
│   ├── loose-thoughts/
│   │   └── loose-thoughts.tsx      # Unlinked captures section
│   ├── triage/
│   │   ├── triage-badge.tsx        # Stale count badge in header
│   │   └── triage-view.tsx         # One-at-a-time triage flow
│   └── departure-board/
│       └── project-row.tsx         # (extend) - add capture indicators
├── hooks/
│   ├── use-captures.ts             # Fetch + cache captures per project
│   ├── use-capture-submit.ts       # Submit + optimistic update
│   ├── use-keyboard-shortcuts.ts   # Global keyboard listener
│   └── use-stale-captures.ts       # Stale capture count for badge
```

### Pattern 1: Persist First, Enrich Later
**What:** Capture hits SQLite immediately with status "raw". A background enrichment service picks up raw captures and runs AI categorization + link extraction asynchronously, then updates via PATCH.
**When to use:** Every capture submission.
**Example:**
```typescript
// POST /api/captures handler (already exists) persists immediately
// Then triggers async enrichment:
async function enrichCapture(db: DrizzleDb, captureId: string) {
  // 1. Update status to pending_enrichment
  updateCapture(db, captureId, { status: "pending_enrichment" });

  // 2. Get capture content
  const capture = getCapture(db, captureId);

  // 3. Get project list for categorization context
  const projectList = listProjects(db);

  // 4. Run AI categorization
  const result = await categorizeCapture(capture.rawContent, projectList);

  // 5. If URL detected, extract link metadata
  const linkMeta = containsUrl(capture.rawContent)
    ? await extractLinkMetadata(capture.rawContent)
    : null;

  // 6. Update capture with results
  updateCapture(db, captureId, {
    projectId: result.confidence >= THRESHOLD ? result.projectSlug : null,
    status: "enriched",
    // New columns: aiConfidence, linkTitle, linkDescription, linkDomain
  });
}
```

### Pattern 2: AI Categorization with Structured Output
**What:** Use AI SDK's generateText + Output.object() with a Zod schema to get typed, validated categorization results.
**When to use:** Every raw capture that needs project assignment.
**Example:**
```typescript
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const categorizationSchema = z.object({
  projectSlug: z.string().nullable().describe("Project slug or null if no match"),
  confidence: z.number().min(0).max(1).describe("Confidence 0-1"),
  reasoning: z.string().describe("Brief explanation of categorization"),
});

async function categorizeCapture(
  content: string,
  projects: Array<{ slug: string; name: string; tagline: string | null }>
) {
  const projectContext = projects
    .map((p) => `- ${p.slug}: ${p.name}${p.tagline ? ` (${p.tagline})` : ""}`)
    .join("\n");

  const { output } = await generateText({
    model: openai("gpt-4o-mini"), // Fast, cheap, good at classification
    output: Output.object({ schema: categorizationSchema }),
    prompt: `Categorize this thought to one of these projects:\n${projectContext}\n\nThought: "${content}"\n\nReturn the best matching project slug and confidence. If no project matches well, return null for projectSlug.`,
  });

  return output;
}
```

### Pattern 3: Optimistic Capture Submission
**What:** Use React 19's useOptimistic to show the capture immediately on the dashboard before the API response returns.
**When to use:** When user submits from capture field or command palette.
**Example:**
```typescript
import { useOptimistic, useTransition } from "react";

function useCaptureSubmit(onSuccess?: () => void) {
  const [isPending, startTransition] = useTransition();

  const submit = (rawContent: string) => {
    startTransition(async () => {
      // Optimistically add to local state
      const tempCapture = {
        id: `temp-${Date.now()}`,
        rawContent,
        status: "raw" as const,
        projectId: null,
        createdAt: new Date().toISOString(),
      };

      // POST to API
      const res = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawContent }),
      });

      if (res.ok) {
        onSuccess?.();
        // Invalidate/refetch captures to get server-assigned data
      }
    });
  };

  return { submit, isPending };
}
```

### Pattern 4: Command Palette Mode Switching
**What:** cmdk with prefix-based mode detection. Default mode is capture, '/' switches to navigation, '?' switches to search.
**When to use:** Command palette interaction.
**Example:**
```typescript
import { Command } from "cmdk";

function CommandPalette({ open, onOpenChange }: Props) {
  const [search, setSearch] = useState("");

  const mode = search.startsWith("/") ? "navigate"
    : search.startsWith("?") ? "search"
    : "capture";

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange}>
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder={
          mode === "navigate" ? "Navigate to..."
          : mode === "search" ? "Search captures..."
          : "What's on your mind..."
        }
      />
      <Command.List>
        {mode === "capture" && search === "" && (
          <>
            <Command.Group heading="Recent Projects">
              {/* 5 recent projects */}
            </Command.Group>
            <Command.Group heading="Recent Captures">
              {/* 3 recent captures */}
            </Command.Group>
          </>
        )}
        {mode === "navigate" && (
          <Command.Group heading="Projects">
            {/* Project list filtered by search.slice(1) */}
          </Command.Group>
        )}
        {mode === "search" && (
          <Command.Group heading="Results">
            {/* FTS5 search results */}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
```

### Anti-Patterns to Avoid
- **Separate inbox for captures:** CONTEXT.md is explicit -- captures are woven into project cards, not a separate inbox view. A separate inbox becomes a graveyard.
- **Blocking on AI enrichment:** Never wait for AI before confirming capture submission. Persist first, enrich later. The capture field should feel instant.
- **Visible confidence scores:** User decided on quiet assignment. No confidence numbers in the UI. Below-threshold goes to loose thoughts silently.
- **Over-engineering keyboard shortcuts:** Minimal set for v1 (Cmd+K, /, Esc). Don't add arrow key navigation, vim bindings, etc.
- **Client-side AI calls:** All AI categorization happens server-side. Never expose API keys to the browser. The enrichment service runs in the API package.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Command palette | Custom dialog with keyboard nav, fuzzy search, a11y | cmdk | 1000+ lines of keyboard handling, ARIA, fuzzy scoring |
| AI provider switching | Custom OpenAI/Anthropic SDK wrapper | AI SDK (ai package) | Provider abstraction, schema validation, error handling |
| URL metadata extraction | Custom fetch + regex + cheerio parsing | open-graph-scraper | Handles redirects, charset encoding, Open Graph/Twitter Card/meta fallbacks |
| Auto-growing textarea | Custom scrollHeight calculation | react-textarea-autosize | SSR-safe, handles reflows, max row limits, composition events |
| Fuzzy text matching | Custom string scoring for palette | cmdk's built-in command-score | Tested against thousands of inputs, handles typos |

**Key insight:** The capture pipeline's complexity is in orchestration (persist -> enrich -> display), not in any single component. Use libraries for the hard UI/AI pieces so implementation time goes toward wiring the flow together.

## Common Pitfalls

### Pitfall 1: Race Condition on Rapid-Fire Captures
**What goes wrong:** User submits 3 captures in quick succession. Enrichment for capture 1 hasn't finished when capture 3 is submitted. Optimistic UI shows all 3 in "loose thoughts" before enrichment completes, then they jump to project cards.
**Why it happens:** Enrichment is async; the UI renders based on current state (no projectId = loose thought).
**How to avoid:** Show captures with status "raw" or "pending_enrichment" with a subtle loading indicator (pulsing dot, not spinner). When enrichment completes and assigns a projectId, the capture smoothly moves to the correct project card on the next data fetch.
**Warning signs:** Captures "teleporting" between loose thoughts and project cards.

### Pitfall 2: AI Categorization Context Stale
**What goes wrong:** Project list used for AI categorization is stale (project added but not in the context sent to AI). Captures for the new project all go to loose thoughts.
**Why it happens:** AI prompt includes project list at call time. If projects are cached or not refreshed, new projects are invisible to AI.
**How to avoid:** Always fetch fresh project list from DB in the enrichment service, not from a cache. Projects change rarely (weekly), but the cost of a fresh DB query is negligible.
**Warning signs:** All captures for a recently added project land in loose thoughts.

### Pitfall 3: Command Palette Steals Focus from Capture Field
**What goes wrong:** User is typing in the always-visible capture field, presses Cmd+K, palette opens and steals content/focus. Or '/' shortcut triggers when user is typing a URL.
**Why it happens:** Global keyboard shortcuts fire regardless of focus context.
**How to avoid:** Only trigger '/' shortcut when no input/textarea is focused. Cmd+K should open palette but NOT transfer capture field content. If user is typing in capture field and opens palette, the capture field content stays put.
**Warning signs:** Characters appearing in wrong input, lost input content.

### Pitfall 4: Link Metadata Extraction Timeout
**What goes wrong:** open-graph-scraper hangs on slow/unreachable URLs, blocking the enrichment pipeline.
**Why it happens:** Some URLs are behind auth walls, firewalls, or just slow. No timeout = enrichment stuck.
**How to avoid:** Set a strict timeout (5 seconds max) on open-graph-scraper. If it fails, preserve the raw URL and mark link metadata as failed. Never retry infinitely.
**Warning signs:** Captures staying in "pending_enrichment" status for minutes.

### Pitfall 5: Database Schema Migration Breaking Existing Data
**What goes wrong:** Adding new columns (aiConfidence, linkTitle, etc.) to captures table requires a migration. If migration doesn't handle defaults, existing captures fail.
**Why it happens:** SQLite requires default values for new NOT NULL columns on existing tables.
**How to avoid:** New columns should be nullable with defaults. Existing captures won't have AI data -- that's fine, they're already enriched (or raw from tests).
**Warning signs:** Migration errors on startup, "NOT NULL constraint failed" on existing rows.

## Code Examples

### Database Schema Extension
```sql
-- New migration: 0002_capture_enrichment.sql
ALTER TABLE captures ADD COLUMN ai_confidence REAL;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN ai_project_slug TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN ai_reasoning TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN link_url TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN link_title TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN link_description TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN link_domain TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN link_image TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN enriched_at INTEGER;
```

### Drizzle Schema Extension
```typescript
// Extend captures table in schema.ts
export const captures = sqliteTable("captures", {
  // ... existing columns ...
  aiConfidence: real("ai_confidence"),
  aiProjectSlug: text("ai_project_slug"),
  aiReasoning: text("ai_reasoning"),
  linkUrl: text("link_url"),
  linkTitle: text("link_title"),
  linkDescription: text("link_description"),
  linkDomain: text("link_domain"),
  linkImage: text("link_image"),
  enrichedAt: integer("enriched_at", { mode: "timestamp" }),
}, (table) => [
  // ... existing indexes ...
  index("captures_enriched_at_idx").on(table.enrichedAt),
]);
```

### Stale Capture Query
```typescript
// Get captures older than 2 weeks that aren't archived
function getStaleCaptures(db: DrizzleDb, limit = 20) {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  return db
    .select()
    .from(captures)
    .where(
      and(
        sql`${captures.createdAt} < ${twoWeeksAgo.getTime() / 1000}`,
        sql`${captures.status} != 'archived'`
      )
    )
    .orderBy(sql`${captures.createdAt} ASC`)
    .limit(limit)
    .all();
}
```

### Link Metadata Extraction
```typescript
import ogs from "open-graph-scraper";

async function extractLinkMetadata(url: string) {
  try {
    const { result } = await ogs({
      url,
      timeout: 5000,
      fetchOptions: {
        headers: { "user-agent": "MissionControl/1.0" },
      },
    });

    return {
      title: result.ogTitle ?? result.dcTitle ?? null,
      description: result.ogDescription ?? result.dcDescription ?? null,
      domain: new URL(url).hostname,
      image: result.ogImage?.[0]?.url ?? null,
    };
  } catch {
    // Extraction failed -- return minimal data
    return {
      title: null,
      description: null,
      domain: new URL(url).hostname,
      image: null,
    };
  }
}
```

### URL Detection in Capture Content
```typescript
// Detect URLs in raw capture text
const URL_REGEX = /https?:\/\/[^\s<>)"']+/gi;

function extractUrls(content: string): string[] {
  return content.match(URL_REGEX) ?? [];
}

function containsUrl(content: string): boolean {
  return URL_REGEX.test(content);
}
```

### Capture Field Component Pattern
```typescript
import TextareaAutosize from "react-textarea-autosize";

function CaptureField({ onSubmit }: { onSubmit: (content: string) => void }) {
  const [value, setValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSubmit(value.trim());
        setValue(""); // Or keep value per CONTEXT decision
      }
    }
  };

  return (
    <TextareaAutosize
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="What's on your mind..."
      minRows={1}
      maxRows={4}
      className="w-full resize-none bg-surface-elevated dark:bg-surface-elevated-dark
        rounded-lg px-4 py-3 text-text-primary dark:text-text-primary-dark
        border border-terracotta/20 focus:border-terracotta focus:outline-none
        placeholder:text-text-muted dark:placeholder:text-text-muted-dark"
    />
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON mode for AI outputs | Structured Outputs (strict schema) | OpenAI Aug 2024, Anthropic Nov 2025 | No more JSON parse failures, guaranteed schema compliance |
| generateObject (AI SDK) | generateText + Output.object() | AI SDK v6 (2025) | Unified API, deprecates separate generateObject function |
| cmdk peer dep React 18 only | cmdk v1.0.4+ supports React 19 | Oct 2024 | No more --force or --legacy-peer-deps needed |
| Custom command palette | cmdk as standard | 2023+ | Industry standard (Linear, Raycast, Vercel) |

**Deprecated/outdated:**
- `generateObject` in AI SDK -- use `generateText` with `output: Output.object()` instead
- cmdk versions < 1.0.4 -- React 19 incompatible
- JSON mode (vs Structured Outputs) -- legacy, no schema guarantee

## Open Questions

1. **AI model cost vs accuracy tradeoff**
   - What we know: gpt-4o-mini is cheapest (~$0.15/1M input tokens) and fast. Claude Haiku is comparable. Both handle classification well.
   - What's unclear: Accuracy across 12+ project domains with short, ambiguous captures hasn't been tested.
   - Recommendation: Start with gpt-4o-mini, add a confidence threshold (0.6 suggested), and log all categorizations for later evaluation. Easy to swap providers via AI SDK config.

2. **Enrichment trigger: inline vs background poll**
   - What we know: The capture POST handler already runs synchronously. Enrichment could be triggered inline (fire-and-forget after response) or via a background poller.
   - What's unclear: Node.js single-thread model means fire-and-forget in the request handler could block other requests during AI call.
   - Recommendation: Use `setImmediate` or `queueMicrotask` to defer enrichment after the HTTP response is sent. For v1, this is simpler than a job queue. If latency becomes an issue, upgrade to a proper queue (BullMQ or similar).

3. **Capture field behavior: clear or keep content after submit**
   - What we know: CONTEXT.md says "field does NOT clear -- cursor stays, ready for the next thought"
   - What's unclear: This contradicts the later note "Capture field behavior modeled after chat input -- submit clears but cursor stays"
   - Recommendation: Clear the content after submit (chat-input model), keep focus in the field. This matches the "rapid-fire stacking" intent better -- you dump one thought, it vanishes into MC, you type the next. The CONTEXT.md "does NOT clear" may mean the *field itself* stays visible (not removed from DOM), not that the *text* persists.

4. **Captures on project cards: display approach**
   - What we know: Must be "woven into" project cards, not a separate inbox. Must not clutter the departure board.
   - What's unclear: Exact visual treatment (Claude's discretion).
   - Recommendation: Show a small capture count badge on project rows. Clicking the badge (or expanding the project row) shows the 3 most recent captures inline. Full list accessible via hero card expansion. This keeps the departure board "smarter in 3 seconds" density while making captures discoverable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x |
| Config file | `packages/api/vitest.config.ts` (forks pool, node env) and `packages/web/vitest.config.ts` (forks pool, jsdom env) |
| Quick run command | `pnpm --filter @mission-control/api test` or `pnpm --filter @mission-control/web test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAPT-01 | Capture submission in < 3s | integration | `pnpm --filter @mission-control/api vitest run src/__tests__/routes/captures.test.ts -x` | Partial (CRUD tests exist, need submission timing test) |
| CAPT-02 | AI categorization with confidence | unit | `pnpm --filter @mission-control/api vitest run src/__tests__/services/ai-categorizer.test.ts -x` | No, Wave 0 |
| CAPT-03 | Project reassignment via PATCH | integration | `pnpm --filter @mission-control/api vitest run src/__tests__/routes/captures.test.ts -x` | Partial (PATCH test exists, need projectId-specific test) |
| CAPT-04 | Captures on project cards | component | `pnpm --filter @mission-control/web vitest run src/__tests__/components/capture-card.test.tsx -x` | No, Wave 0 |
| CAPT-05 | Loose thoughts section | component | `pnpm --filter @mission-control/web vitest run src/__tests__/components/loose-thoughts.test.tsx -x` | No, Wave 0 |
| CAPT-06 | Persist first (status = raw) | integration | `pnpm --filter @mission-control/api vitest run src/__tests__/routes/captures.test.ts -x` | Yes (existing test verifies status = "raw") |
| CAPT-07 | Stale capture triage query | unit | `pnpm --filter @mission-control/api vitest run src/__tests__/services/stale-captures.test.ts -x` | No, Wave 0 |
| CAPT-08 | Archived captures searchable | integration | `pnpm --filter @mission-control/api vitest run src/__tests__/routes/search.test.ts -x` | Partial (search test exists, need archived filter test) |
| CAPT-09 | URL detection + link metadata | unit | `pnpm --filter @mission-control/api vitest run src/__tests__/services/link-extractor.test.ts -x` | No, Wave 0 |
| INTR-01 | Command palette open/close/modes | component | `pnpm --filter @mission-control/web vitest run src/__tests__/components/command-palette.test.tsx -x` | No, Wave 0 |
| INTR-02 | Keyboard shortcuts fire correctly | component | `pnpm --filter @mission-control/web vitest run src/__tests__/hooks/use-keyboard-shortcuts.test.ts -x` | No, Wave 0 |
| INTR-03 | Hybrid keyboard + mouse interaction | manual-only | N/A (interactive behavior best verified visually) | N/A |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test` and `pnpm --filter @mission-control/web test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/services/ai-categorizer.test.ts` -- covers CAPT-02 (mock AI SDK, verify schema output)
- [ ] `packages/api/src/__tests__/services/link-extractor.test.ts` -- covers CAPT-09 (mock open-graph-scraper, verify URL detection)
- [ ] `packages/api/src/__tests__/services/stale-captures.test.ts` -- covers CAPT-07 (verify date-based query)
- [ ] `packages/web/src/__tests__/components/capture-card.test.tsx` -- covers CAPT-04
- [ ] `packages/web/src/__tests__/components/loose-thoughts.test.tsx` -- covers CAPT-05
- [ ] `packages/web/src/__tests__/components/command-palette.test.tsx` -- covers INTR-01
- [ ] `packages/web/src/__tests__/hooks/use-keyboard-shortcuts.test.ts` -- covers INTR-02
- [ ] AI SDK dependency: `pnpm --filter @mission-control/api add ai @ai-sdk/openai @ai-sdk/anthropic`
- [ ] cmdk dependency: `pnpm --filter @mission-control/web add cmdk`

## Sources

### Primary (HIGH confidence)
- [cmdk GitHub releases](https://github.com/pacocoursey/cmdk/releases) - Verified React 19 support in v1.0.4+, latest is v1.1.1
- [cmdk React 19 issue #266](https://github.com/pacocoursey/cmdk/issues/266) - Confirmed resolved via Radix UI dependency update
- [AI SDK docs: Generating Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) - generateText + Output.object() API
- [AI SDK OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai) - @ai-sdk/openai package, model names
- [AI SDK Anthropic provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) - @ai-sdk/anthropic package, model names
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) - Zod schema support via zodResponseFormat
- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) - Public beta, Zod support
- [React useOptimistic](https://react.dev/reference/react/useOptimistic) - React 19 optimistic UI hook

### Secondary (MEDIUM confidence)
- [open-graph-scraper npm](https://www.npmjs.com/package/open-graph-scraper) - v6.11.0, Fetch API based, TypeScript types
- [react-textarea-autosize GitHub](https://github.com/Andarist/react-textarea-autosize) - v8.5.x, React 18/19 compatible
- [Vercel AI SDK 6 blog post](https://vercel.com/blog/ai-sdk-6) - Unified generateText/generateObject, Output.object()
- [CSS-Tricks auto-growing textarea](https://css-tricks.com/the-cleanest-trick-for-autogrowing-textareas/) - CSS grid alternative if library is unwanted

### Tertiary (LOW confidence)
- AI categorization accuracy claims across 12+ domains -- needs empirical validation in this specific project context
- react-textarea-autosize React 19 compatibility -- very likely fine but not explicitly verified (no breaking changes expected)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified on npm/GitHub, React 19 compatibility confirmed for cmdk
- Architecture: HIGH - Follows existing patterns (DI, Zod schemas, factory pattern, component composition), extends rather than replaces
- Pitfalls: HIGH - Based on direct codebase analysis of existing patterns and known async enrichment challenges
- AI categorization accuracy: MEDIUM - Library support is solid, but classification accuracy across 12+ project domains is unproven

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable domain, libraries are mature)
