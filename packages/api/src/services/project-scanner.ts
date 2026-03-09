import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TTLCache } from "./cache.js";
import { upsertProject, listProjects, getProject } from "../db/queries/projects.js";
import type { MCConfig } from "../lib/config.js";
import type { DrizzleDb } from "../db/index.js";

const execFile = promisify(execFileCb);

const EXEC_TIMEOUT = 10_000; // 10 seconds

export interface GitCommit {
  hash: string;
  message: string;
  relativeTime: string;
}

export interface GsdState {
  status: string;
  stoppedAt: string | null;
  percent: number | null;
}

export interface GitScanResult {
  branch: string;
  dirty: boolean;
  dirtyFiles: string[];
  commits: GitCommit[];
  gsdState: GsdState | null;
}

// Module-level scan data cache (keyed by project slug)
const scanCache = new TTLCache<GitScanResult>(60_000);

/**
 * Scan a single git repo for status information.
 * Returns null if path doesn't exist or isn't a git repository.
 */
export async function scanProject(
  projectPath: string
): Promise<GitScanResult | null> {
  // Check if path exists
  if (!existsSync(projectPath)) {
    return null;
  }

  // Check if it's a git repo
  if (!existsSync(join(projectPath, ".git"))) {
    return null;
  }

  try {
    // Run three git commands in parallel
    const [branchResult, statusResult, logResult] = await Promise.all([
      execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: projectPath,
        timeout: EXEC_TIMEOUT,
      }).catch(() => ({ stdout: "", stderr: "" })),
      execFile("git", ["status", "--porcelain"], {
        cwd: projectPath,
        timeout: EXEC_TIMEOUT,
      }).catch(() => ({ stdout: "", stderr: "" })),
      execFile("git", ["log", "-5", "--format=%h|%s|%ar"], {
        cwd: projectPath,
        timeout: EXEC_TIMEOUT,
      }).catch(() => ({ stdout: "", stderr: "" })),
    ]);

    const branch = branchResult.stdout.trim();
    const statusLines = statusResult.stdout.trim();
    const dirtyFiles = statusLines
      ? statusLines.split("\n").map((line: string) => line.trim())
      : [];
    const dirty = dirtyFiles.length > 0;

    const commits: GitCommit[] = logResult.stdout
      .trim()
      .split("\n")
      .filter((line: string) => line.length > 0)
      .map((line: string) => {
        const [hash, message, relativeTime] = line.split("|");
        return {
          hash: hash ?? "",
          message: message ?? "",
          relativeTime: relativeTime ?? "",
        };
      });

    // Read GSD state if present
    const gsdState = readGsdState(projectPath);

    return {
      branch,
      dirty,
      dirtyFiles,
      commits,
      gsdState,
    };
  } catch {
    return null;
  }
}

/**
 * Parse GSD state from .planning/STATE.md frontmatter.
 */
function readGsdState(repoPath: string): GsdState | null {
  const statePath = join(repoPath, ".planning", "STATE.md");
  if (!existsSync(statePath)) return null;

  try {
    const content = readFileSync(statePath, "utf-8");

    // Parse YAML frontmatter between --- markers
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const frontmatter = match[1]!;

    // Simple YAML parsing for the fields we need
    const statusMatch = frontmatter.match(/^status:\s*(.+)$/m);
    const stoppedAtMatch = frontmatter.match(/^stopped_at:\s*(.+)$/m);
    const percentMatch = frontmatter.match(/^\s*percent:\s*(\d+)/m);

    const status = statusMatch ? statusMatch[1]!.trim().replace(/^["']|["']$/g, "") : "unknown";
    const stoppedAt = stoppedAtMatch
      ? stoppedAtMatch[1]!.trim().replace(/^["']|["']$/g, "")
      : null;
    const percentStr = percentMatch ? percentMatch[1]! : null;
    const percent = percentStr ? parseInt(percentStr, 10) : null;

    return { status, stoppedAt, percent };
  } catch {
    return null;
  }
}

/**
 * Scan all projects from config, upsert into database, and cache results.
 */
export async function scanAllProjects(
  config: MCConfig,
  db: DrizzleDb
): Promise<void> {
  const results = await Promise.allSettled(
    config.projects.map(async (project) => {
      const scanResult = await scanProject(project.path);
      const now = new Date();

      // Upsert project record regardless of scan success
      upsertProject(db, {
        slug: project.slug,
        name: project.name,
        tagline: project.tagline ?? null,
        path: project.path,
        host: project.host,
        lastScannedAt: now,
      });

      // Cache scan data if available
      if (scanResult) {
        scanCache.set(project.slug, scanResult);
      }

      return { slug: project.slug, scanResult };
    })
  );

  // Log any failures but don't throw
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Project scan failed:", result.reason);
    }
  }
}

/**
 * Get project data merged with cached scan data.
 * Falls back to database-only data if cache is empty.
 */
export function getProjectWithScanData(
  db: DrizzleDb,
  slug: string
) {
  const project = getProject(db, slug);
  const scanData = scanCache.get(slug);

  return {
    ...project,
    branch: scanData?.branch ?? null,
    dirty: scanData?.dirty ?? null,
    dirtyFiles: scanData?.dirtyFiles ?? [],
    lastCommitHash: scanData?.commits[0]?.hash ?? null,
    lastCommitMessage: scanData?.commits[0]?.message ?? null,
    lastCommitTime: scanData?.commits[0]?.relativeTime ?? null,
    commits: scanData?.commits ?? [],
    gsdState: scanData?.gsdState ?? null,
  };
}

/**
 * Get cached scan data for a project (used by list endpoint).
 */
export function getCachedScanData(slug: string): GitScanResult | undefined {
  return scanCache.get(slug);
}

/**
 * Start a background poll that refreshes all project data periodically.
 * Returns the timer handle for cleanup.
 */
export function startBackgroundPoll(
  config: MCConfig,
  db: DrizzleDb,
  intervalMs: number = 300_000 // 5 minutes
): ReturnType<typeof setInterval> {
  // Run initial scan
  scanAllProjects(config, db).catch((err) =>
    console.error("Initial scan failed:", err)
  );

  // Set up recurring scan
  return setInterval(() => {
    scanAllProjects(config, db).catch((err) =>
      console.error("Background scan failed:", err)
    );
  }, intervalMs);
}

/**
 * Invalidate all cached scan data.
 */
export function invalidateScanCache(): void {
  scanCache.invalidateAll();
}
