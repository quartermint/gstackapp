import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import pLimit from "p-limit";
import { getKnowledge, upsertKnowledge } from "../db/queries/knowledge.js";
import { upsertHealthFinding, resolveFindings } from "../db/queries/health.js";
import { eventBus } from "./event-bus.js";
import type { MCConfig } from "../lib/config.js";
import type { DrizzleDb } from "../db/index.js";
import type Database from "better-sqlite3";
import type { HealthFindingInput } from "@mission-control/shared";

const execFile = promisify(execFileCb);

// ── Constants ─────────────────────────────────────────────────────

const SSH_CONNECT_TIMEOUT = 5; // seconds
const SSH_CMD_TIMEOUT = 15_000; // ms
const LOCAL_CMD_TIMEOUT = 10_000; // ms
const MAX_FILE_SIZE = 512_000; // 500KB guard
const STALE_AGE_DAYS = 30;
const STALE_COMMIT_THRESHOLD = 10;
const DEFAULT_INTERVAL_MS = 3_600_000; // 1 hour
const DELIM = "===DELIM===";

// ── Content Hash ──────────────────────────────────────────────────

/**
 * Compute SHA-256 hex digest of content, normalizing CRLF -> LF first.
 */
export function computeContentHash(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized, "utf-8").digest("hex");
}

// ── Local CLAUDE.md Reader ────────────────────────────────────────

/**
 * Read CLAUDE.md from a local project path via git.
 * Returns content, lastModified ISO timestamp, and commit count since last update.
 * Returns null on any error (graceful degradation).
 */
async function readLocalClaudeMd(
  projectPath: string
): Promise<{ content: string; lastModified: string; commitsSince: number } | null> {
  try {
    const script = [
      `git show HEAD:CLAUDE.md 2>/dev/null`,
      `echo "${DELIM}"`,
      `git log -1 --format=%aI -- CLAUDE.md 2>/dev/null`,
      `echo "${DELIM}"`,
      `git rev-list --count $(git log -1 --format=%H -- CLAUDE.md 2>/dev/null)..HEAD 2>/dev/null || echo "0"`,
    ].join(" && ");

    const result = await execFile("sh", ["-c", script], {
      cwd: projectPath,
      timeout: LOCAL_CMD_TIMEOUT,
    });

    const parts = result.stdout.split(DELIM);
    const content = (parts[0] ?? "").trimEnd();
    const lastModified = (parts[1] ?? "").trim();
    const commitsSince = parseInt((parts[2] ?? "0").trim(), 10) || 0;

    if (!content) return null;
    if (content.length > MAX_FILE_SIZE) {
      console.warn(
        `CLAUDE.md at ${projectPath} exceeds ${MAX_FILE_SIZE} bytes (${content.length}), skipping`
      );
      return null;
    }

    return { content, lastModified: lastModified || new Date().toISOString(), commitsSince };
  } catch {
    return null;
  }
}

// ── Remote CLAUDE.md Reader (SSH) ─────────────────────────────────

/**
 * Read CLAUDE.md from a Mac Mini project via SSH.
 * Returns null on failure (graceful degradation per D-07).
 */
async function readRemoteClaudeMd(
  sshHost: string,
  projectPath: string
): Promise<{ content: string; lastModified: string; commitsSince: number } | null> {
  try {
    const script = [
      `cd "${projectPath}" && git show HEAD:CLAUDE.md 2>/dev/null`,
      `echo "${DELIM}"`,
      `git log -1 --format=%aI -- CLAUDE.md 2>/dev/null`,
      `echo "${DELIM}"`,
      `git rev-list --count $(git log -1 --format=%H -- CLAUDE.md 2>/dev/null)..HEAD 2>/dev/null || echo "0"`,
    ].join(" && ");

    const result = await execFile(
      "ssh",
      ["-o", `ConnectTimeout=${SSH_CONNECT_TIMEOUT}`, sshHost, script],
      { timeout: SSH_CMD_TIMEOUT }
    );

    const parts = result.stdout.split(DELIM);
    const content = (parts[0] ?? "").trimEnd();
    const lastModified = (parts[1] ?? "").trim();
    const commitsSince = parseInt((parts[2] ?? "0").trim(), 10) || 0;

    if (!content) return null;
    if (content.length > MAX_FILE_SIZE) {
      console.warn(
        `CLAUDE.md at ${sshHost}:${projectPath} exceeds ${MAX_FILE_SIZE} bytes, skipping`
      );
      return null;
    }

    return { content, lastModified: lastModified || new Date().toISOString(), commitsSince };
  } catch {
    return null;
  }
}

// ── Stale Knowledge Detection ─────────────────────────────────────

/**
 * Check if a CLAUDE.md file is stale based on age and commit activity.
 * Both thresholds must be met (AND logic per D-08):
 * - >30 days since last CLAUDE.md update
 * - >10 commits since last CLAUDE.md update
 *
 * Pure function -- no side effects.
 */
export function checkStaleKnowledge(
  slug: string,
  lastModified: string,
  commitsSinceUpdate: number,
  now?: Date
): HealthFindingInput | null {
  const reference = now ?? new Date();
  const lastModDate = new Date(lastModified);
  const ageDays = Math.floor(
    (reference.getTime() - lastModDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (ageDays > STALE_AGE_DAYS && commitsSinceUpdate > STALE_COMMIT_THRESHOLD) {
    return {
      projectSlug: slug,
      checkType: "stale_knowledge",
      severity: "warning",
      detail: `CLAUDE.md is ${ageDays} days old with ${commitsSinceUpdate} commits since last update`,
      metadata: { ageDays, commitsSinceUpdate },
    };
  }

  return null;
}

// ── Scan Target Builder ───────────────────────────────────────────

interface ScanTarget {
  slug: string;
  path: string;
  host: "local" | "mac-mini";
  sshHost?: string;
}

/**
 * Build deduplicated scan targets from config.
 * - Skips GitHub-only projects (no filesystem access)
 * - Multi-copy entries: prefers local copy over mac-mini (one target per slug)
 * - Handles localSshHost for reverse SSH when MC runs on Mac Mini
 */
export function buildScanTargets(config: MCConfig): ScanTarget[] {
  const targets: ScanTarget[] = [];
  const seenSlugs = new Set<string>();

  for (const entry of config.projects) {
    if (seenSlugs.has(entry.slug)) continue;

    if ("copies" in entry) {
      // Multi-copy entry: prefer local over mac-mini
      const localCopy = entry.copies.find((c) => c.host === "local");
      const macMiniCopy = entry.copies.find((c) => c.host === "mac-mini");

      if (localCopy) {
        seenSlugs.add(entry.slug);
        if (config.localSshHost) {
          // MC runs on Mac Mini, local entries need reverse SSH
          targets.push({
            slug: entry.slug,
            path: localCopy.path,
            host: "local",
            sshHost: config.localSshHost,
          });
        } else {
          targets.push({
            slug: entry.slug,
            path: localCopy.path,
            host: "local",
          });
        }
      } else if (macMiniCopy) {
        seenSlugs.add(entry.slug);
        targets.push({
          slug: entry.slug,
          path: macMiniCopy.path,
          host: "mac-mini",
          sshHost: config.macMiniSshHost ?? "ryans-mac-mini",
        });
      }
    } else {
      // Single-host entry
      if (entry.host === "github") continue; // Skip GitHub-only

      seenSlugs.add(entry.slug);

      if (entry.host === "local") {
        if (config.localSshHost) {
          targets.push({
            slug: entry.slug,
            path: entry.path,
            host: "local",
            sshHost: config.localSshHost,
          });
        } else {
          targets.push({
            slug: entry.slug,
            path: entry.path,
            host: "local",
          });
        }
      } else if (entry.host === "mac-mini") {
        targets.push({
          slug: entry.slug,
          path: entry.path,
          host: "mac-mini",
          sshHost: config.macMiniSshHost ?? "ryans-mac-mini",
        });
      }
    }
  }

  return targets;
}

// ── Core Scan Function ────────────────────────────────────────────

/**
 * Scan all projects for CLAUDE.md content and store knowledge.
 * - Builds scan targets (skipping GitHub, deduplicating multi-copy)
 * - Reads CLAUDE.md locally or via SSH
 * - Content-hash caching prevents unnecessary DB writes
 * - Detects stale knowledge and surfaces as health findings
 * - Emits knowledge:updated events for SSE
 *
 * Returns stats: { scanned, updated, errors }
 */
export async function scanAllKnowledge(
  config: MCConfig,
  db: DrizzleDb,
  sqlite: Database.Database
): Promise<{ scanned: number; updated: number; errors: number }> {
  const targets = buildScanTargets(config);
  const limit = pLimit(3);

  let scanned = 0;
  let updated = 0;
  let errors = 0;

  const results = await Promise.allSettled(
    targets.map((target) =>
      limit(async () => {
        // Read CLAUDE.md based on host type
        let readResult: { content: string; lastModified: string; commitsSince: number } | null = null;

        if (target.sshHost) {
          // SSH read (either mac-mini or reverse SSH for local)
          readResult = await readRemoteClaudeMd(target.sshHost, target.path);
        } else {
          // Direct local read
          readResult = await readLocalClaudeMd(target.path);
        }

        if (!readResult) {
          errors++;
          return;
        }

        scanned++;

        const { content, lastModified, commitsSince } = readResult;
        const contentHash = computeContentHash(content);

        // Check existing knowledge for content-hash caching
        const existing = getKnowledge(db, target.slug);

        if (existing && existing.contentHash === contentHash) {
          // Content unchanged -- skip DB write (KNOW-02 caching)
          // Still check for staleness
          const staleFinding = checkStaleKnowledge(
            target.slug,
            lastModified,
            commitsSince
          );

          if (staleFinding) {
            upsertHealthFinding(db, sqlite, staleFinding);
          } else {
            // Not stale: resolve any previous stale_knowledge finding
            resolveFindings(sqlite, target.slug, []);
          }

          return;
        }

        // Content changed or new -- upsert knowledge
        upsertKnowledge(sqlite, {
          projectSlug: target.slug,
          content,
          contentHash,
          fileSize: Buffer.byteLength(content, "utf-8"),
          lastModified,
          commitsSinceUpdate: commitsSince,
        });

        updated++;

        // Emit event for SSE subscribers
        eventBus.emit("mc:event", { type: "knowledge:updated", id: target.slug });

        // Check stale knowledge
        const staleFinding = checkStaleKnowledge(
          target.slug,
          lastModified,
          commitsSince
        );

        if (staleFinding) {
          upsertHealthFinding(db, sqlite, staleFinding);
        } else {
          // Not stale: resolve any previous stale_knowledge finding
          resolveFindings(sqlite, target.slug, []);
        }
      })
    )
  );

  // Log any unhandled promise rejections
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Knowledge scan target failed:", result.reason);
      errors++;
    }
  }

  return { scanned, updated, errors };
}

// ── Timer Registration ────────────────────────────────────────────

/**
 * Start knowledge scanner on an independent hourly timer.
 * Follows the discovery-scanner pattern: run initial scan, then setInterval.
 *
 * @param config - MC configuration
 * @param db - Drizzle database instance
 * @param sqlite - Raw better-sqlite3 instance
 * @param intervalMs - Scan interval (default: 1 hour)
 * @returns Timer handle for cleanup
 */
export function startKnowledgeScan(
  config: MCConfig,
  db: DrizzleDb,
  sqlite: Database.Database,
  intervalMs?: number
): ReturnType<typeof setInterval> {
  const interval = intervalMs ?? DEFAULT_INTERVAL_MS;

  // Run initial scan
  scanAllKnowledge(config, db, sqlite)
    .then((stats) => {
      console.log(
        `Knowledge scan complete: ${stats.scanned} scanned, ${stats.updated} updated, ${stats.errors} errors`
      );
    })
    .catch((err) => {
      console.error("Initial knowledge scan failed:", err);
    });

  // Set up recurring scan
  return setInterval(() => {
    scanAllKnowledge(config, db, sqlite)
      .then((stats) => {
        if (stats.updated > 0) {
          console.log(
            `Knowledge scan: ${stats.scanned} scanned, ${stats.updated} updated, ${stats.errors} errors`
          );
        }
      })
      .catch((err) => {
        console.error("Knowledge scan failed:", err);
      });
  }, interval);
}
