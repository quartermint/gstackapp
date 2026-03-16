import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { eventBus } from "./event-bus.js";
import { upsertStar, getLatestStarredAt, getStarCount } from "../db/queries/stars.js";
import type { DrizzleDb } from "../db/index.js";
import type { MCConfig } from "../lib/config.js";

const execFile = promisify(execFileCb);
const GH_TIMEOUT = 30_000; // 30 seconds -- paginated calls can be slow
const RATE_LIMIT_THRESHOLD = 500;

/**
 * Shape of each item returned by the GitHub Stars API
 * when using the star+json Accept header (includes starred_at).
 */
interface GitHubStarResponse {
  starred_at: string;
  repo: {
    id: number;
    full_name: string;
    description: string | null;
    language: string | null;
    topics: string[];
    html_url: string;
  };
}

/**
 * Check the current GitHub API rate limit budget.
 * Returns { remaining, limit }. On error, returns { remaining: 0, limit: 0 }.
 */
export async function checkRateLimit(): Promise<{ remaining: number; limit: number }> {
  try {
    const result = await execFile(
      "gh",
      ["api", "rate_limit", "--jq", ".rate | {remaining, limit}"],
      { timeout: GH_TIMEOUT }
    );
    const parsed = JSON.parse(result.stdout.trim()) as { remaining?: number; limit?: number };
    return { remaining: parsed.remaining ?? 0, limit: parsed.limit ?? 5000 };
  } catch {
    return { remaining: 0, limit: 0 };
  }
}

/**
 * Fetch all starred repos from GitHub using gh CLI with pagination.
 * Uses the star+json Accept header to include starred_at timestamps.
 */
export async function fetchStarsFromGitHub(): Promise<GitHubStarResponse[]> {
  const result = await execFile(
    "gh",
    [
      "api", "--paginate", "user/starred",
      "-H", "Accept: application/vnd.github.v3.star+json",
    ],
    { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 } // 2 min timeout, 50MB buffer
  );

  const parsed: unknown = JSON.parse(result.stdout);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected array from GitHub stars API");
  }
  return parsed as GitHubStarResponse[];
}

/**
 * Sync starred repos from GitHub to the local database.
 *
 * 1. Check rate limit (skip if <500 remaining)
 * 2. Fetch all stars from GitHub
 * 3. Incremental sync: only process stars newer than latest in DB
 * 4. Upsert each new star
 * 5. Emit SSE event
 */
export async function syncStars(
  db: DrizzleDb,
  _config?: MCConfig | null
): Promise<{ synced: number; skipped: number; total: number }> {
  // 1. Check rate limit
  const { remaining } = await checkRateLimit();
  if (remaining < RATE_LIMIT_THRESHOLD) {
    console.log(
      `Star sync skipped: only ${remaining} API calls remaining (threshold: ${RATE_LIMIT_THRESHOLD})`
    );
    return { synced: 0, skipped: 0, total: getStarCount(db) };
  }

  // 2. Fetch all stars from GitHub
  let githubStars: GitHubStarResponse[];
  try {
    githubStars = await fetchStarsFromGitHub();
  } catch (err) {
    console.error("Star sync failed -- GitHub API error:", (err as Error).message);
    return { synced: 0, skipped: 0, total: getStarCount(db) };
  }

  // 3. Get latest starred_at for incremental filtering
  const latestStarredAt = getLatestStarredAt(db);

  // 4. Filter to only new stars (incremental sync)
  let newStars = githubStars;
  let skipped = 0;
  if (latestStarredAt) {
    const cutoff = latestStarredAt.getTime();
    newStars = githubStars.filter(
      (s) => new Date(s.starred_at).getTime() > cutoff
    );
    skipped = githubStars.length - newStars.length;
  }

  // 5. Persist each star (upsert)
  let synced = 0;
  for (const star of newStars) {
    try {
      upsertStar(db, {
        githubId: star.repo.id,
        fullName: star.repo.full_name,
        description: star.repo.description,
        language: star.repo.language,
        topics: star.repo.topics ?? [],
        htmlUrl: star.repo.html_url,
        starredAt: new Date(star.starred_at),
      });
      synced++;
    } catch (err) {
      console.error(
        `Failed to upsert star ${star.repo.full_name}:`,
        (err as Error).message
      );
    }
  }

  const total = getStarCount(db);
  console.log(`Star sync complete: ${synced} new, ${skipped} unchanged, ${total} total`);

  // 6. Emit SSE event
  eventBus.emit("mc:event", { type: "star:synced", id: "all", data: { synced, total } });

  return { synced, skipped, total };
}

/**
 * Start a recurring star sync timer.
 * Runs an initial sync immediately, then repeats at the configured interval.
 */
export function startStarSync(
  config: MCConfig,
  db: DrizzleDb
): ReturnType<typeof setInterval> {
  const intervalHours = config.discovery?.starSyncIntervalHours ?? 6;
  const intervalMs = intervalHours * 60 * 60 * 1000;

  // Run initial sync
  syncStars(db, config).catch((err) =>
    console.error("Initial star sync failed:", err)
  );

  // Set up recurring sync
  return setInterval(() => {
    syncStars(db, config).catch((err) =>
      console.error("Background star sync failed:", err)
    );
  }, intervalMs);
}
