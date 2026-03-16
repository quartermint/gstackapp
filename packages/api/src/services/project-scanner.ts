import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pLimit from "p-limit";
import { TTLCache } from "./cache.js";
import { upsertProject, getProject } from "../db/queries/projects.js";
import { upsertCommits } from "../db/queries/commits.js";
import { createSession, getSession, updateSessionStatus } from "../db/queries/sessions.js";
import { indexProject } from "../db/queries/search.js";
import { upsertCopy, getCopiesByProject, getCopiesByRemoteUrl } from "../db/queries/copies.js";
import { upsertHealthFinding, resolveFindings, getActiveFindings } from "../db/queries/health.js";
import { eventBus } from "./event-bus.js";
import { normalizeRemoteUrl, runHealthChecks, escalateDirtySeverity } from "./git-health.js";
import type { HealthScanData } from "./git-health.js";
import type { MCConfig, ProjectConfigEntry } from "../lib/config.js";
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

// Timestamp of when the most recent scan cycle began (RISK-05).
// Route handlers compare finding.detectedAt >= lastScanCycleStartedAt to derive isNew.
let lastScanCycleStartedAt: string | null = null;

/**
 * Get the ISO timestamp of when the most recent scan cycle started.
 * Used by API routes to compute the isNew flag on health findings (RISK-05).
 */
export function getLastScanCycleStartedAt(): string | null {
  return lastScanCycleStartedAt;
}

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
 * Build the SSH batch script for scanning a remote git repo.
 * Includes both legacy scan sections and health-relevant sections.
 */
function buildSshBatchScript(projectPath: string): string {
  return [
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
}

/**
 * Parse legacy scan result from SSH batch output.
 */
function parseSshScanResult(output: string): GitScanResult {
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
    const script = buildSshBatchScript(projectPath);

    const result = await execFile("ssh", ["-o", "ConnectTimeout=5", sshHost, script], {
      timeout: SSH_TIMEOUT,
    });

    return parseSshScanResult(result.stdout);
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

// ── Multi-Copy Normalization ──────────────────────────────────────

/** Flattened scan target for both single-host and multi-copy entries. */
interface ScanTarget {
  slug: string;
  name: string;
  tagline?: string;
  repo?: string;
  host: "local" | "mac-mini" | "github";
  path: string;
}

/**
 * Flatten config projects array into individual scan targets.
 * Multi-copy entries expand into one ScanTarget per copy.
 * Single-host entries pass through as-is.
 */
function flattenToScanTargets(projects: ProjectConfigEntry[]): ScanTarget[] {
  const targets: ScanTarget[] = [];

  for (const entry of projects) {
    if ("copies" in entry) {
      // Multi-copy entry: expand each copy into its own target
      for (const copy of entry.copies) {
        targets.push({
          slug: entry.slug,
          name: entry.name,
          tagline: entry.tagline,
          repo: entry.repo,
          host: copy.host,
          path: copy.path,
        });
      }
    } else {
      // Single-host entry: pass through
      targets.push({
        slug: entry.slug,
        name: entry.name,
        tagline: entry.tagline,
        repo: entry.repo,
        host: entry.host,
        path: entry.path,
      });
    }
  }

  return targets;
}

// ── Module-level Health Data Store ────────────────────────────────

// Stores health data collected during the most recent scan cycle.
// Keyed as `${slug}:${host}` for multi-copy disambiguation.
let collectedHealthData = new Map<string, HealthScanData>();

/**
 * Get health data collected during the most recent scan cycle.
 * Used by Plan 03's post-scan phase to run health checks.
 */
export function getCollectedHealthData(): Map<string, HealthScanData> {
  return collectedHealthData;
}

// ── Post-Scan Health Phase ────────────────────────────────────────

/**
 * Check ancestry relationship between two commits in a local repo.
 * Uses git merge-base --is-ancestor to determine the relationship.
 *
 * Returns:
 * - "ancestor": headA is an ancestor of headB (headA is behind)
 * - "descendant": headB is an ancestor of headA (headA is ahead)
 * - "diverged": neither is an ancestor of the other
 * - "unknown": error (shallow clone, missing objects, git not found)
 */
export async function checkAncestry(
  localPath: string,
  headA: string,
  headB: string
): Promise<"ancestor" | "descendant" | "diverged" | "unknown"> {
  try {
    // Check if headA is ancestor of headB
    await execFile("git", ["merge-base", "--is-ancestor", headA, headB], {
      cwd: localPath,
      timeout: 5_000,
    });
    // Exit 0: headA is ancestor of headB
    return "ancestor";
  } catch (err: unknown) {
    const exitCode = (err as { code?: number }).code;

    if (exitCode === 1) {
      // headA is not ancestor of headB; check reverse
      try {
        await execFile("git", ["merge-base", "--is-ancestor", headB, headA], {
          cwd: localPath,
          timeout: 5_000,
        });
        // Exit 0: headB is ancestor of headA
        return "descendant";
      } catch (reverseErr: unknown) {
        const reverseCode = (reverseErr as { code?: number }).code;
        if (reverseCode === 1) {
          // Neither is ancestor of the other
          return "diverged";
        }
        // Exit 128 or other error on reverse check
        return "unknown";
      }
    }

    // Exit 128 (unknown commit / shallow clone) or other error
    return "unknown";
  }
}

/**
 * Post-scan health phase: runs after all repos are scanned.
 *
 * Stage 1: Per-repo health checks + finding persistence
 * Stage 2: Dirty working tree severity escalation (HLTH-06)
 * Stage 3: Multi-copy divergence detection (COPY-03)
 * Stage 4: Event emission (health:changed, copy:diverged)
 */
async function runPostScanHealthPhase(
  healthDataMap: Map<string, HealthScanData>,
  db: DrizzleDb,
  sqlite: Database.Database
): Promise<void> {
  // ── Stage 1: Per-repo health checks + finding persistence ──
  for (const [key, healthData] of healthDataMap) {
    const slug = key.split(":")[0]!;
    const findings = runHealthChecks(healthData);

    for (const finding of findings) {
      upsertHealthFinding(db, sqlite, finding);
    }

    // Collect active check types; always include "diverged_copies" to prevent
    // resolveFindings from auto-resolving it (handled in Stage 3)
    const activeCheckTypes = [
      ...findings.map((f) => f.checkType),
      "diverged_copies",
    ];
    resolveFindings(sqlite, slug, activeCheckTypes);
  }

  // ── Stage 2: Dirty working tree severity escalation (HLTH-06) ──
  const allActive = getActiveFindings(db);
  const dirtyFindings = allActive.filter(
    (f) => f.checkType === "dirty_working_tree"
  );

  for (const finding of dirtyFindings) {
    const escalated = escalateDirtySeverity(finding.detectedAt);
    if (escalated !== finding.severity) {
      upsertHealthFinding(db, sqlite, {
        projectSlug: finding.projectSlug,
        checkType: "dirty_working_tree",
        severity: escalated,
        detail: finding.detail,
        metadata: finding.metadata ?? undefined,
      });
    }
  }

  // ── Stage 3: Multi-copy divergence detection (COPY-03) ──
  const divergedSlugs: string[] = [];

  // Group scanned copies by normalized remote URL
  const byRemoteUrl = new Map<string, HealthScanData[]>();
  for (const healthData of healthDataMap.values()) {
    if (!healthData.remoteUrl) continue;
    const normalized = normalizeRemoteUrl(healthData.remoteUrl);
    const group = byRemoteUrl.get(normalized) ?? [];
    group.push(healthData);
    byRemoteUrl.set(normalized, group);
  }

  for (const [normalizedUrl, scannedCopies] of byRemoteUrl) {
    // Also load copy records from DB (picks up hosts not scanned this cycle)
    const dbCopies = getCopiesByRemoteUrl(db, normalizedUrl);

    // Build a combined set of { slug, host, headCommit, lastCheckedAt, path }
    type CopyInfo = {
      slug: string;
      host: string;
      headCommit: string | null;
      lastCheckedAt: string | null;
      path: string | null;
    };
    const copyMap = new Map<string, CopyInfo>();

    // DB records first (may be stale)
    for (const dbCopy of dbCopies) {
      copyMap.set(`${dbCopy.projectSlug}:${dbCopy.host}`, {
        slug: dbCopy.projectSlug,
        host: dbCopy.host,
        headCommit: dbCopy.headCommit,
        lastCheckedAt: dbCopy.lastCheckedAt,
        path: dbCopy.path,
      });
    }

    // Fresh scan data overwrites DB records
    for (const scanned of scannedCopies) {
      // Find the matching health map key to get the host
      for (const [hKey, hData] of healthDataMap) {
        if (hData === scanned) {
          const host = hKey.split(":")[1] ?? "local";
          copyMap.set(`${scanned.slug}:${host}`, {
            slug: scanned.slug,
            host,
            headCommit: scanned.headCommit,
            lastCheckedAt: new Date().toISOString(),
            path: null, // not needed for divergence check
          });
          break;
        }
      }
    }

    const copies = Array.from(copyMap.values());
    if (copies.length < 2) continue;

    const slug = copies[0]!.slug;
    const heads = copies.map((c) => c.headCommit).filter(Boolean) as string[];
    const uniqueHeads = [...new Set(heads)];

    if (uniqueHeads.length <= 1) {
      // All HEADs match (or only one has a commit): resolve any diverged finding
      sqlite
        .prepare(
          `UPDATE project_health SET resolved_at = ? WHERE project_slug = ? AND check_type = 'diverged_copies' AND resolved_at IS NULL`
        )
        .run(new Date().toISOString(), slug);
      continue;
    }

    // HEADs differ -- check ancestry
    // Find a local copy path for running git merge-base
    const localCopy = copies.find(
      (c) => c.host === "local" && c.headCommit
    );
    const localPath = localCopy?.path;
    // Try to get the path from healthDataMap if not in copyMap
    let repoPath: string | null = localPath ?? null;
    if (!repoPath) {
      for (const [hKey, hData] of healthDataMap) {
        if (hData.slug === slug && hKey.endsWith(":local")) {
          // Need the project path -- look it up from the scan targets
          // We can find it from the DB copy record
          const dbLocal = dbCopies.find(
            (c) => c.host === "local" && c.projectSlug === slug
          );
          repoPath = dbLocal?.path ?? null;
          break;
        }
      }
    }

    let relationship: "ancestor" | "descendant" | "diverged" | "unknown" =
      "unknown";
    if (repoPath && uniqueHeads.length >= 2) {
      relationship = await checkAncestry(
        repoPath,
        uniqueHeads[0]!,
        uniqueHeads[1]!
      );
    }

    if (relationship === "ancestor" || relationship === "descendant") {
      // One is ahead: resolve diverged finding
      sqlite
        .prepare(
          `UPDATE project_health SET resolved_at = ? WHERE project_slug = ? AND check_type = 'diverged_copies' AND resolved_at IS NULL`
        )
        .run(new Date().toISOString(), slug);
      continue;
    }

    // Diverged or unknown: check staleness and upsert finding
    const STALE_THRESHOLD_MS = 600_000; // 10 minutes (2 scan cycles)
    const now = Date.now();
    const isStale = copies.some((c) => {
      if (!c.lastCheckedAt) return true;
      return now - new Date(c.lastCheckedAt).getTime() > STALE_THRESHOLD_MS;
    });

    const localHead = uniqueHeads[0] ?? "unknown";
    const remoteHead = uniqueHeads[1] ?? "unknown";

    upsertHealthFinding(db, sqlite, {
      projectSlug: slug,
      checkType: "diverged_copies",
      severity: isStale ? "warning" : "critical",
      detail: `Copies have diverged: ${localHead.slice(0, 7)} vs ${remoteHead.slice(0, 7)}${isStale ? " (stale data)" : ""}`,
      metadata: { localHead, remoteHead, stale: isStale },
    });

    divergedSlugs.push(slug);
  }

  // ── Stage 4: Event emission ──
  eventBus.emit("mc:event", { type: "health:changed", id: "all" });

  for (const slug of divergedSlugs) {
    eventBus.emit("mc:event", { type: "copy:diverged", id: slug });
  }
}

/**
 * Detect Aider sessions by scanning git log for commits authored by "(aider)".
 * Creates completed session records for any new Aider commits found.
 * Uses commit hash as session ID prefix for dedup: "aider-<hash>".
 */
async function detectAiderSessions(
  repoPath: string,
  projectSlug: string,
  db: DrizzleDb
): Promise<number> {
  try {
    const result = await execFile(
      "git",
      ["log", "--author=(aider)", "--since=30 minutes ago", "--format=%H|%aI|%s"],
      { cwd: repoPath, timeout: 5_000 }
    );

    const stdout = result.stdout.trim();
    if (!stdout) return 0;

    const lines = stdout.split("\n").filter((l) => l.length > 0);
    let created = 0;

    for (const line of lines) {
      const [hash, _date, ...messageParts] = line.split("|");
      const message = messageParts.join("|"); // Rejoin in case message contains "|"
      if (!hash) continue;

      const sessionId = `aider-${hash.slice(0, 12)}`;

      // Dedup: skip if session already exists for this commit
      try {
        getSession(db, sessionId);
        continue; // Already tracked
      } catch {
        // Session doesn't exist -- create it
      }

      createSession(
        db,
        {
          sessionId,
          source: "aider",
          model: null,
          cwd: repoPath,
          taskDescription: message || null,
        },
        projectSlug
      );

      // Immediately mark as completed (Aider sessions are detected post-hoc)
      updateSessionStatus(db, sessionId, "completed", "detected via git log");

      created++;
    }

    return created;
  } catch {
    // Silently ignore -- Aider detection is best-effort
    return 0;
  }
}

/**
 * Scan all projects from config, upsert into database, persist commits, cache results,
 * collect health data, and manage copy records.
 * Routes to the appropriate scanner based on project host type.
 */
export async function scanAllProjects(
  config: MCConfig,
  db: DrizzleDb,
  sqlite?: Database.Database
): Promise<void> {
  // Record scan cycle start time for RISK-05 isNew computation
  lastScanCycleStartedAt = new Date().toISOString();

  const sshHost = config.macMiniSshHost ?? "ryans-mac-mini";
  const limit = pLimit(10);
  const healthMap = new Map<string, HealthScanData>();

  // Flatten multi-copy entries into individual scan targets
  const targets = flattenToScanTargets(config.projects);

  // Track which slugs have been upserted to avoid duplicate project upserts for multi-copy entries
  const upsertedSlugs = new Set<string>();

  const results = await Promise.allSettled(
    targets.map((target) =>
      limit(async () => {
        let scanResult: GitScanResult | null = null;
        let sshRawOutput: string | null = null;

        switch (target.host) {
          case "local":
            scanResult = await scanProject(target.path);
            break;
          case "mac-mini": {
            // Run SSH scan and capture raw output for health parsing
            try {
              const script = buildSshBatchScript(target.path);
              const result = await execFile("ssh", ["-o", "ConnectTimeout=5", sshHost, script], {
                timeout: SSH_TIMEOUT,
              });

              sshRawOutput = result.stdout;
              scanResult = parseSshScanResult(result.stdout);
            } catch (err) {
              console.warn(`SSH scan failed for ${target.path} on ${sshHost}:`, (err as Error).message);
              // SSH failure: scanResult stays null, sshRawOutput stays null
              // Do NOT upsert copy (preserves old lastCheckedAt for stale detection per COPY-04)
            }
            break;
          }
          case "github":
            if (target.repo) {
              scanResult = await scanGithubProject(target.repo);
            }
            break;
        }

        const now = new Date();

        // Upsert project record once per slug (not once per copy)
        if (!upsertedSlugs.has(target.slug)) {
          upsertedSlugs.add(target.slug);

          const upsertedProject = upsertProject(db, {
            slug: target.slug,
            name: target.name,
            tagline: target.tagline ?? null,
            path: target.path || target.repo || "",
            host: target.host,
            lastScannedAt: now,
          });

          // Index project in unified search (if sqlite available)
          if (sqlite && upsertedProject) {
            try {
              indexProject(sqlite, {
                slug: target.slug,
                name: target.name,
                tagline: target.tagline ?? null,
                createdAt: now.toISOString(),
              });
            } catch {
              // Ignore duplicate insert errors -- project may already be indexed
            }
          }
        }

        // Cache scan data if available
        if (scanResult) {
          scanCache.set(target.slug, scanResult);

          // Persist commits to SQLite (if sqlite available)
          if (sqlite && scanResult.commits.length > 0) {
            try {
              upsertCommits(
                db,
                sqlite,
                scanResult.commits.map((c) => ({
                  hash: c.hash,
                  message: c.message,
                  projectSlug: target.slug,
                  authorDate: c.date,
                }))
              );
            } catch (err) {
              console.error(`Failed to persist commits for ${target.slug}:`, err);
            }
          }
        }

        // Collect health data and upsert copy for local/mac-mini hosts
        if (target.host !== "github" && scanResult) {
          // Look up cached isPublic from existing copy record
          const existingCopies = getCopiesByProject(db, target.slug);
          const existingCopy = existingCopies.find((c) => c.host === target.host);
          let cachedIsPublic: boolean | null = existingCopy?.isPublic ?? null;

          let healthData: HealthScanData | null = null;

          if (target.host === "local") {
            healthData = await collectLocalHealthData(
              target.path,
              target.slug,
              scanResult.dirty,
              cachedIsPublic
            );
          } else if (target.host === "mac-mini" && sshRawOutput) {
            healthData = parseHealthFromSshOutput(
              sshRawOutput,
              target.slug,
              scanResult.dirty,
              cachedIsPublic
            );
          }

          if (healthData) {
            // If isPublic is still null/false and we have a remote URL, try fetching from GitHub
            if (cachedIsPublic === null && healthData.remoteUrl) {
              const isPublic = await fetchIsPublic(healthData.remoteUrl);
              if (isPublic !== null) {
                cachedIsPublic = isPublic;
                healthData = { ...healthData, isPublic };
              }
            }

            const healthKey = `${target.slug}:${target.host}`;
            healthMap.set(healthKey, healthData);

            // Upsert copy record with health-relevant fields
            upsertCopy(db, {
              projectSlug: target.slug,
              host: target.host,
              path: target.path,
              remoteUrl: healthData.remoteUrl ? normalizeRemoteUrl(healthData.remoteUrl) : null,
              headCommit: healthData.headCommit,
              branch: healthData.branch,
              isPublic: cachedIsPublic,
            });
          }
        }

        // Detect Aider sessions for local repos
        if (target.host === "local" && scanResult) {
          try {
            const aiderCount = await detectAiderSessions(target.path, target.slug, db);
            if (aiderCount > 0) {
              console.log(`Detected ${aiderCount} new Aider session(s) for ${target.slug}`);
            }
          } catch {
            // Aider detection failure is non-fatal
          }
        }

        return { slug: target.slug, scanResult };
      })
    )
  );

  // Store health data for Plan 03's post-scan phase
  collectedHealthData = healthMap;

  // Log any failures but don't throw
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Project scan failed:", result.reason);
    }
  }

  // Post-scan health phase
  if (sqlite) {
    const healthData = getCollectedHealthData();
    try {
      await runPostScanHealthPhase(healthData, db, sqlite);
    } catch (err) {
      console.error("Health phase failed:", err);
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
