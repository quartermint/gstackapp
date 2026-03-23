import StreamZip from "node-stream-zip";
import matter from "gray-matter";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import pLimit from "p-limit";
import { nanoid } from "nanoid";
import { eventBus } from "./event-bus.js";
import { captures } from "../db/schema.js";
import type { DrizzleDb } from "../db/index.js";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  total: number;
  tweets: number;
  weblinks: number;
  dailyNotes: number;
  other: number;
}

export interface CapacitiesConfig {
  backupDir: string;
  scheduleId: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of content with CRLF normalization.
 * Same pattern as knowledge aggregator for cross-platform consistency.
 */
export function computeContentHash(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized, "utf-8").digest("hex");
}

/**
 * Replace leading ~ with the user's home directory.
 */
function resolveHomedir(p: string): string {
  if (p.startsWith("~")) {
    return join(homedir(), p.slice(1));
  }
  return p;
}

/**
 * Classify a Capacities markdown entry by its path within the ZIP.
 */
export function classifyCapacitiesEntry(
  entryPath: string,
  _frontmatter: Record<string, unknown>
): { sourceSubtype: string; captureType: "text" | "link" } {
  if (entryPath.includes("/Tweets/")) {
    return { sourceSubtype: "tweet", captureType: "link" };
  }
  if (entryPath.includes("/Weblinks/")) {
    return { sourceSubtype: "weblink", captureType: "link" };
  }
  if (entryPath.includes("/DailyNotes/")) {
    return { sourceSubtype: "daily_note", captureType: "text" };
  }
  if (entryPath.includes("/People/")) {
    return { sourceSubtype: "person", captureType: "text" };
  }
  return { sourceSubtype: "other", captureType: "text" };
}

/**
 * Build capture rawContent from Capacities frontmatter and markdown body.
 */
export function buildCaptureContent(
  frontmatter: Record<string, unknown>,
  body: string,
  sourceSubtype: string
): string {
  switch (sourceSubtype) {
    case "tweet":
      // URL is the capture; content fetched later by tweet-fetcher
      return `${(frontmatter.url as string) ?? ""}`;
    case "weblink":
      return `${(frontmatter.title as string) ?? ""}\n${(frontmatter.url as string) ?? ""}\n${body}`.trim();
    case "daily_note":
      return body.trim() || `Daily Note: ${(frontmatter.date as string) ?? "unknown"}`;
    case "person":
      return `${(frontmatter.title as string) ?? ""}\n${body}`.trim();
    default:
      return body.trim();
  }
}

// ── Core Functions ──────────────────────────────────────────────────

/**
 * Find the most recent Capacities backup ZIP in the configured directory.
 * ZIP filenames contain timestamps: "Capacities (2026-03-23 00-38-22).zip"
 */
export function findLatestBackupZip(config: CapacitiesConfig): string | null {
  const backupDir = resolveHomedir(config.backupDir);
  const scheduleDir = join(backupDir, config.scheduleId);

  try {
    const files = readdirSync(scheduleDir) as unknown as string[];
    const zips = files.filter((f: string) => f.endsWith(".zip"));

    if (zips.length === 0) return null;

    // Sort alphabetically -- timestamp in filename ensures chronological order
    zips.sort();
    const latest = zips[zips.length - 1];

    return resolve(scheduleDir, latest as string);
  } catch {
    return null;
  }
}

/**
 * Import a Capacities backup ZIP into the captures table.
 *
 * Uses direct Drizzle insert (bypasses createCapture) to avoid
 * triggering per-item enrichment on 800+ items.
 * Content-hash dedup prevents re-importing already-imported items.
 */
export async function importCapacitiesBackup(
  db: DrizzleDb,
  _sqlite: Database.Database,
  zipPath: string
): Promise<ImportResult> {
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    errors: 0,
    total: 0,
    tweets: 0,
    weblinks: 0,
    dailyNotes: 0,
    other: 0,
  };

  const zip = new StreamZip.async({ file: zipPath });

  try {
    const entries = await zip.entries();

    // Filter to .md files only
    const mdEntries = Object.values(entries).filter(
      (e) => e.name.endsWith(".md")
    );
    result.total = mdEntries.length;

    // Pre-load existing content hashes for dedup
    const existingHashes = new Set<string>();
    const existingCaptures = db
      .select({ rawContent: captures.rawContent })
      .from(captures)
      .where(eq(captures.sourceType, "capacities"))
      .all();
    for (const cap of existingCaptures) {
      existingHashes.add(computeContentHash(cap.rawContent));
    }

    // Track hashes within this import batch too
    const batchHashes = new Set<string>();

    const limit = pLimit(5);

    const tasks = mdEntries.map((entry) =>
      limit(async () => {
        try {
          const buf = await zip.entryData(entry.name);
          const raw = buf.toString("utf-8");
          const parsed = matter(raw);

          const frontmatter = parsed.data as Record<string, unknown>;
          const body = parsed.content;

          const { sourceSubtype, captureType } = classifyCapacitiesEntry(
            entry.name,
            frontmatter
          );

          const rawContent = buildCaptureContent(frontmatter, body, sourceSubtype);

          // Skip empty content
          if (!rawContent) {
            result.skipped++;
            return;
          }

          const hash = computeContentHash(rawContent);

          // Dedup: skip if already exists in DB or in this batch
          if (existingHashes.has(hash) || batchHashes.has(hash)) {
            result.skipped++;
            return;
          }

          batchHashes.add(hash);

          // Direct Drizzle insert -- bypasses createCapture to avoid
          // triggering per-item enrichment on 800+ items
          const now = new Date();
          db.insert(captures)
            .values({
              id: nanoid(),
              rawContent,
              type: captureType,
              status: "raw",
              sourceType: "capacities",
              createdAt: now,
              updatedAt: now,
            })
            .run();

          result.imported++;

          // Track type counts
          switch (sourceSubtype) {
            case "tweet":
              result.tweets++;
              break;
            case "weblink":
              result.weblinks++;
              break;
            case "daily_note":
              result.dailyNotes++;
              break;
            default:
              result.other++;
              break;
          }

          // Emit progress every 50 items
          const processed = result.imported + result.skipped + result.errors;
          if (processed > 0 && processed % 50 === 0) {
            eventBus.emit("mc:event", {
              type: "capture:created",
              id: "import-progress",
              data: {
                subtype: "import:progress",
                imported: result.imported,
                total: result.total,
              },
            });
          }
        } catch (err) {
          result.errors++;
          console.error(`Error importing ${entry.name}:`, err);
        }
      })
    );

    await Promise.all(tasks);
  } finally {
    await zip.close();
  }

  // Emit completion event
  eventBus.emit("mc:event", {
    type: "capture:created",
    id: "import-complete",
    data: {
      subtype: "import:complete",
      ...result,
    },
  });

  return result;
}
