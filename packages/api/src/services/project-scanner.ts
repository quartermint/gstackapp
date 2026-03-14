import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TTLCache } from "./cache.js";
import { upsertProject, getProject } from "../db/queries/projects.js";
import { upsertCommits } from "../db/queries/commits.js";
import { indexProject } from "../db/queries/search.js";
import { eventBus } from "./event-bus.js";
import { normalizeRemoteUrl } from "./git-health.js";
import type { HealthScanData } from "./git-health.js";
import type { MCConfig } from "../lib/config.js";
import type { DrizzleDb } from "../db/index.js";
import type Database from "better-sqlite3";

const execFile = promisify(execFileCb);

const EXEC_TIMEOUT = 10_000; // 10 seconds
const SSH_TIMEOUT = 20_000; // 20 seconds for SSH commands
const GH_TIMEOUT = 15_000; // 15 seconds for GitHub API calls

export interface GitCommit {
  hash: string;
  message: string;
  relativeTime: string;
  date: string;
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
// TTL (10min) must exceed poll interval (5min) so data never expires between polls
const scanCache = new TTLCache<GitScanResult>(600_000);

/**
 * Parse git log output into GitCommit array.
 */
function parseGitLog(stdout: string): GitCommit[] {
  return stdout
    .trim()
    .split("\n")
    .filter((line: string) => line.length > 0)
    .map((line: string) => {
      const [hash, message, relativeTime, date] = line.split("|");
      return {
        hash: hash ?? "",
        message: message ?? "",
        relativeTime: relativeTime ?? "",
        date: date ?? "",
      };
    });
}

/**
 * Parse git status --porcelain output into dirty files array.
 */
function parseGitStatus(stdout: string): string[] {
  const statusLines = stdout.trim();
  return statusLines
    ? statusLines.split("\n").map((line: string) => line.trim())
    : [];
}

// ── Health Data Collection ────────────────────────────────────────

/**
 * Parse health-relevant git data from section-delimited output.
 * Shared between local and SSH scan paths.
 */
function parseHealthFromSections(
  sections: Record<string, string>,
  slug: string,
  dirty: boolean,
  cachedIsPublic: boolean | null
): HealthScanData {
  const remoteUrlRaw = (sections["REMOTE"] ?? "").trim();
  const remoteUrl = remoteUrlRaw || null;
  const hasRemote = remoteUrl !== null && remoteUrl.length > 0;

  const symref = (sections["SYMREF"] ?? "").trim();
  const isDetachedHead = symref === "DETACHED" || symref === "";
  const branch = isDetachedHead ? "HEAD" : symref;

  const statusSb = (sections["STATUS_SB"] ?? "").trim();
  const upstreamGone = statusSb.includes("[gone]");

  const upstreamRemote = (sections["UPSTREAM_REMOTE"] ?? "").trim();
  const hasUpstream = upstreamRemote.length > 0;

  const unpushedRaw = parseInt(sections["REVLIST_UP"] ?? "-1", 10);
  const unpushedCount = unpushedRaw < 0 ? 0 : unpushedRaw;

  const unpulledRaw = parseInt(sections["REVLIST_DOWN"] ?? "-1", 10);
  const unpulledCount = unpulledRaw < 0 ? 0 : unpulledRaw;

  const headCommit = (sections["HEAD_HASH"] ?? "").trim() || null;

  return {
    slug,
    branch,
    dirty,
    remoteUrl,
    hasRemote,
    isDetachedHead,
    hasUpstream,
    upstreamGone,
    unpushedCount,
    unpulledCount,
    headCommit,
    isPublic: cachedIsPublic ?? false,
  };
}

/**
 * Collect health-relevant git data for a single local repo in one sh -c invocation.
 * Returns HealthScanData or null on failure.
 */
export async function collectLocalHealthData(
  projectPath: string,
  slug: string,
  dirty: boolean,
  cachedIsPublic: boolean | null
): Promise<HealthScanData | null> {
  try {
    const delim = "===DELIM===";
    const script = [
      `git remote get-url origin 2>/dev/null || echo ""`,
      `echo "${delim}"`,
      `git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED"`,
      `echo "${delim}"`,
      `git status -sb 2>/dev/null | head -1`,
      `echo "${delim}"`,
      `BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo ""); test -n "$BRANCH" && git config branch.$BRANCH.remote 2>/dev/null || echo ""`,
      `echo "${delim}"`,
      `git rev-list @{u}..HEAD --count 2>/dev/null || echo "-1"`,
      `echo "${delim}"`,
      `git rev-list HEAD..@{u} --count 2>/dev/null || echo "-1"`,
      `echo "${delim}"`,
      `git rev-parse HEAD 2>/dev/null || echo ""`,
    ].join(" && ");

    const result = await execFile("sh", ["-c", script], {
      cwd: projectPath,
      timeout: EXEC_TIMEOUT,
    });

    const parts = result.stdout.split(delim).map((p) => p.trim());

    const sections: Record<string, string> = {
      REMOTE: parts[0] ?? "",
      SYMREF: parts[1] ?? "",
      STATUS_SB: parts[2] ?? "",
      UPSTREAM_REMOTE: parts[3] ?? "",
      REVLIST_UP: parts[4] ?? "",
      REVLIST_DOWN: parts[5] ?? "",
      HEAD_HASH: parts[6] ?? "",
    };

    return parseHealthFromSections(sections, slug, dirty, cachedIsPublic);
  } catch {
    return null;
  }
}

/**
 * Fetch whether a repo is public via the GitHub API (gh CLI).
 * Returns true for public, false for private, null on error.
 */
export async function fetchIsPublic(remoteUrl: string): Promise<boolean | null> {
  try {
    const normalized = normalizeRemoteUrl(remoteUrl);
    // normalized format: "github.com/owner/repo"
    const segments = normalized.split("/");
    // Find github.com host segment, then owner/repo after it
    const ghIndex = segments.findIndex((s) => s.includes("github.com"));
    if (ghIndex < 0 || ghIndex + 2 >= segments.length) return null;

    const owner = segments[ghIndex + 1];
    const repo = segments[ghIndex + 2];
    if (!owner || !repo) return null;

    const result = await execFile(
      "gh",
      ["api", `repos/${owner}/${repo}`, "--jq", ".private"],
      { timeout: GH_TIMEOUT }
    );

    const output = result.stdout.trim();
    if (output === "false") return true; // not private = public
    if (output === "true") return false; // private
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse health data from SSH batch output.
 * Extracts the 7 health-relevant sections added to the SSH batch script.
 */
export function parseHealthFromSshOutput(
  sshOutput: string,
  slug: string,
  dirty: boolean,
  cachedIsPublic: boolean | null
): HealthScanData {
  const extract = (marker: string, nextMarker: string): string => {
    const start = sshOutput.split(`===${marker}===`)[1];
    if (!start) return "";
    const end = start.split(`===${nextMarker}===`)[0];
    return (end ?? start).trim();
  };

  const sections: Record<string, string> = {
    REMOTE: extract("REMOTE", "SYMREF"),
    SYMREF: extract("SYMREF", "STATUS_SB"),
    STATUS_SB: extract("STATUS_SB", "UPSTREAM_REMOTE"),
    UPSTREAM_REMOTE: extract("UPSTREAM_REMOTE", "REVLIST_UP"),
    REVLIST_UP: extract("REVLIST_UP", "REVLIST_DOWN"),
    REVLIST_DOWN: extract("REVLIST_DOWN", "HEAD_HASH"),
    HEAD_HASH: sshOutput.split("===HEAD_HASH===")[1]?.trim() ?? "",
  };

  return parseHealthFromSections(sections, slug, dirty, cachedIsPublic);
}

/**
 * Scan a single local git repo for status information.
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
      execFile("git", ["log", "-50", "--format=%h|%s|%ar|%aI"], {
        cwd: projectPath,
        timeout: EXEC_TIMEOUT,
      }).catch(() => ({ stdout: "", stderr: "" })),
    ]);

    const branch = branchResult.stdout.trim();
    const dirtyFiles = parseGitStatus(statusResult.stdout);
    const dirty = dirtyFiles.length > 0;
    const commits = parseGitLog(logResult.stdout);

    // Read GSD state if present
    const gsdState = readGsdState(projectPath);

    return { branch, dirty, dirtyFiles, commits, gsdState };
  } catch {
    return null;
  }
}

/**
 * Scan a git repo on the Mac Mini via SSH.
 * Batches all git commands into a single SSH connection.
 */
export async function scanRemoteProject(
  projectPath: string,
  sshHost: string
): Promise<GitScanResult | null> {
  try {
    const script = [
      `cd "${projectPath}" 2>/dev/null || exit 1`,
      `echo "===BRANCH==="`,
      `git rev-parse --abbrev-ref HEAD 2>/dev/null`,
      `echo "===STATUS==="`,
      `git status --porcelain 2>/dev/null`,
      `echo "===LOG==="`,
      `git log -50 --format='%h|%s|%ar|%aI' 2>/dev/null`,
      `echo "===GSD==="`,
      `cat .planning/STATE.md 2>/dev/null || echo ""`,
      `echo "===REMOTE==="`,
      `git remote get-url origin 2>/dev/null || echo ""`,
      `echo "===SYMREF==="`,
      `git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED"`,
      `echo "===STATUS_SB==="`,
      `git status -sb 2>/dev/null | head -1`,
      `echo "===UPSTREAM_REMOTE==="`,
      `BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo ""); test -n "$BRANCH" && git config branch.$BRANCH.remote 2>/dev/null || echo ""`,
      `echo "===REVLIST_UP==="`,
      `git rev-list @{u}..HEAD --count 2>/dev/null || echo "-1"`,
      `echo "===REVLIST_DOWN==="`,
      `git rev-list HEAD..@{u} --count 2>/dev/null || echo "-1"`,
      `echo "===HEAD_HASH==="`,
      `git rev-parse HEAD 2>/dev/null || echo ""`,
    ].join(" && ");

    const result = await execFile("ssh", ["-o", "ConnectTimeout=5", sshHost, script], {
      timeout: SSH_TIMEOUT,
    });

    const output = result.stdout;

    // Parse sections
    const branchSection = output.split("===BRANCH===")[1]?.split("===STATUS===")[0]?.trim() ?? "";
    const statusSection = output.split("===STATUS===")[1]?.split("===LOG===")[0]?.trim() ?? "";
    const logSection = output.split("===LOG===")[1]?.split("===GSD===")[0]?.trim() ?? "";
    const gsdSection = output.split("===GSD===")[1]?.split("===REMOTE===")[0]?.trim() ?? "";

    const branch = branchSection;
    const dirtyFiles = parseGitStatus(statusSection);
    const dirty = dirtyFiles.length > 0;
    const commits = parseGitLog(logSection);
    const gsdState = parseGsdStateContent(gsdSection);

    return { branch, dirty, dirtyFiles, commits, gsdState };
  } catch (err) {
    console.warn(`SSH scan failed for ${projectPath} on ${sshHost}:`, (err as Error).message);
    return null;
  }
}

/**
 * Scan a GitHub-only repo via the gh CLI.
 * Returns branch and recent commits (no dirty files — it's remote).
 */
export async function scanGithubProject(
  repo: string
): Promise<GitScanResult | null> {
  try {
    const [repoResult, commitsResult] = await Promise.all([
      execFile("gh", ["api", `repos/${repo}`, "--jq", ".default_branch"], {
        timeout: GH_TIMEOUT,
      }).catch(() => ({ stdout: "", stderr: "" })),
      execFile(
        "gh",
        [
          "api",
          `repos/${repo}/commits?per_page=50`,
          "--jq",
          '.[] | (.sha[0:7] + "|" + (.commit.message | split("\n")[0]) + "|" + .commit.author.date)',
        ],
        { timeout: GH_TIMEOUT }
      ).catch(() => ({ stdout: "", stderr: "" })),
    ]);

    const branch = repoResult.stdout.trim();

    const commits: GitCommit[] = commitsResult.stdout
      .trim()
      .split("\n")
      .filter((line: string) => line.length > 0)
      .map((line: string) => {
        const [hash, message, date] = line.split("|");
        return {
          hash: hash ?? "",
          message: message ?? "",
          relativeTime: "",
          date: date ?? "",
        };
      });

    return {
      branch,
      dirty: false,
      dirtyFiles: [],
      commits,
      gsdState: null,
    };
  } catch (err) {
    console.warn(`GitHub scan failed for ${repo}:`, (err as Error).message);
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
    return parseGsdStateContent(content);
  } catch {
    return null;
  }
}

/**
 * Parse GSD state from STATE.md content string.
 */
function parseGsdStateContent(content: string): GsdState | null {
  if (!content || content.trim().length === 0) return null;

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
}

/**
 * Scan all projects from config, upsert into database, persist commits, and cache results.
 * Routes to the appropriate scanner based on project host type.
 */
export async function scanAllProjects(
  config: MCConfig,
  db: DrizzleDb,
  sqlite?: Database.Database
): Promise<void> {
  const sshHost = config.macMiniSshHost ?? "ryans-mac-mini";

  const results = await Promise.allSettled(
    config.projects.map(async (project) => {
      // Multi-copy entries are handled by the health scanner (Phase 7), not the legacy scanner
      if (!("path" in project) || !("host" in project)) {
        return;
      }

      let scanResult: GitScanResult | null = null;

      switch (project.host) {
        case "local":
          scanResult = await scanProject(project.path);
          break;
        case "mac-mini":
          scanResult = await scanRemoteProject(project.path, sshHost);
          break;
        case "github":
          if (project.repo) {
            scanResult = await scanGithubProject(project.repo);
          }
          break;
      }

      const now = new Date();

      // Upsert project record regardless of scan success
      const upsertedProject = upsertProject(db, {
        slug: project.slug,
        name: project.name,
        tagline: project.tagline ?? null,
        path: project.path || project.repo || "",
        host: project.host,
        lastScannedAt: now,
      });

      // Index project in unified search (if sqlite available)
      if (sqlite && upsertedProject) {
        try {
          indexProject(sqlite, {
            slug: project.slug,
            name: project.name,
            tagline: project.tagline ?? null,
            createdAt: now.toISOString(),
          });
        } catch {
          // Ignore duplicate insert errors -- project may already be indexed
        }
      }

      // Cache scan data if available
      if (scanResult) {
        scanCache.set(project.slug, scanResult);

        // Persist commits to SQLite (if sqlite available)
        if (sqlite && scanResult.commits.length > 0) {
          try {
            upsertCommits(
              db,
              sqlite,
              scanResult.commits.map((c) => ({
                hash: c.hash,
                message: c.message,
                projectSlug: project.slug,
                authorDate: c.date,
              }))
            );
          } catch (err) {
            console.error(`Failed to persist commits for ${project.slug}:`, err);
          }
        }
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

  // Emit domain event for real-time subscribers
  eventBus.emit("mc:event", { type: "scan:complete", id: "all" });
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
    lastCommitDate: scanData?.commits[0]?.date ?? null,
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
  intervalMs: number = 300_000, // 5 minutes
  sqlite?: Database.Database
): ReturnType<typeof setInterval> {
  // Run initial scan
  scanAllProjects(config, db, sqlite).catch((err) =>
    console.error("Initial scan failed:", err)
  );

  // Set up recurring scan
  return setInterval(() => {
    scanAllProjects(config, db, sqlite).catch((err) =>
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
