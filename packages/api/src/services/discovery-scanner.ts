import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { opendir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import pLimit from "p-limit";
import {
  upsertDiscovery,
  getDismissedPaths,
  getDiscoveryByPath,
  getDiscovery,
  updateDiscoveryStatus,
  getDiscoveriesByNormalizedUrl,
} from "../db/queries/discoveries.js";
import { upsertProject } from "../db/queries/projects.js";
import { scanProject } from "./project-scanner.js";
import { normalizeRemoteUrl } from "./git-health.js";
import { eventBus } from "./event-bus.js";
import type { MCConfig } from "../lib/config.js";
import type { DrizzleDb } from "../db/index.js";

const execFile = promisify(execFileCb);

const EXEC_TIMEOUT = 5_000; // 5 seconds for git commands during discovery
const SSH_CONNECT_TIMEOUT = 3; // seconds (per DISC-05 spec)
const SSH_CMD_TIMEOUT = 10_000; // 10 seconds
const GH_API_TIMEOUT = 15_000; // 15 seconds

/**
 * Hard-coded exclusion list -- directories that are never scanned.
 */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".Trash",
  "Library",
  ".cache",
  ".cargo",
  ".local",
  "Applications",
  ".npm",
  ".nvm",
  ".docker",
]);

/**
 * Expand ~ to the user's home directory.
 */
function expandPath(p: string): string {
  if (p === "~" || p.startsWith("~/")) {
    return p.replace(/^~/, homedir());
  }
  return resolve(p);
}

/**
 * Extract all tracked project paths from mc.config.json for a given host.
 * Handles both single-host and multi-copy entries.
 */
function getTrackedPaths(
  config: MCConfig,
  host: "local" | "mac-mini"
): Set<string> {
  const paths = new Set<string>();

  for (const entry of config.projects) {
    if ("copies" in entry) {
      // Multi-copy entry
      for (const copy of entry.copies) {
        if (copy.host === host) {
          paths.add(copy.path);
        }
      }
    } else {
      // Single-host entry
      if (entry.host === host && entry.path) {
        paths.add(entry.path);
      }
    }
  }

  return paths;
}

/**
 * Extract tracked GitHub repo full names (e.g. "quartermint/mainline-ios")
 * from mc.config.json. Normalized to lowercase for comparison.
 */
function getTrackedGithubRepos(config: MCConfig): Set<string> {
  const repos = new Set<string>();

  for (const entry of config.projects) {
    if ("copies" in entry) {
      // Multi-copy entries don't have a repo field directly relevant here
      if (entry.repo) {
        repos.add(entry.repo.toLowerCase());
      }
    } else {
      if (entry.host === "github" && entry.repo) {
        repos.add(entry.repo.toLowerCase());
      }
      // Also catch local/mac-mini entries that have a repo field
      if (entry.repo) {
        repos.add(entry.repo.toLowerCase());
      }
    }
  }

  return repos;
}

/**
 * Check if a directory is a git repo with at least 1 commit.
 * Returns { remoteUrl, lastCommitDate } or null.
 */
async function probeGitRepo(
  dirPath: string
): Promise<{
  remoteUrl: string | null;
  lastCommitDate: string | null;
} | null> {
  // Quick check for .git directory
  if (!existsSync(join(dirPath, ".git"))) {
    return null;
  }

  try {
    // Single sh -c invocation: check commit count, get remote URL, get last commit date
    const script = [
      `git rev-list --count HEAD 2>/dev/null || echo "0"`,
      `echo "===DELIM==="`,
      `git remote get-url origin 2>/dev/null || echo ""`,
      `echo "===DELIM==="`,
      `git log -1 --format=%aI 2>/dev/null || echo ""`,
    ].join(" && ");

    const result = await execFile("sh", ["-c", script], {
      cwd: dirPath,
      timeout: EXEC_TIMEOUT,
    });

    const parts = result.stdout.split("===DELIM===").map((p) => p.trim());

    const commitCount = parseInt(parts[0] ?? "0", 10);
    if (commitCount < 1) return null; // Skip repos with 0 commits

    const remoteUrl = parts[1] || null;
    const lastCommitDate = parts[2] || null;

    return { remoteUrl, lastCommitDate };
  } catch {
    return null;
  }
}

/**
 * Cross-host dedup: check if a discovery with the same normalized remote URL
 * already exists on a DIFFERENT host.
 *
 * Same repo on MacBook + Mac Mini + GitHub should appear as one discovery entry.
 * This dedup happens at insert time -- before upserting, we check if an equivalent
 * discovery already exists elsewhere.
 */
function isAlreadyDiscoveredByRemoteUrl(
  db: DrizzleDb,
  remoteUrl: string | null,
  currentHost: "local" | "mac-mini" | "github"
): boolean {
  if (!remoteUrl) return false;
  const normalized = normalizeRemoteUrl(remoteUrl);
  const existing = getDiscoveriesByNormalizedUrl(db, normalized);
  // If any existing discovery is on a DIFFERENT host, this is a cross-host dupe
  return existing.some((d) => d.host !== currentHost);
}

/**
 * Scan configured root directories for git repos not in mc.config.json.
 * Depth-1 only -- scans immediate children, never recursive.
 *
 * Also triggers SSH and GitHub org scans after local scan.
 * Returns the total number of new discoveries found across all sources.
 */
export async function scanForDiscoveries(
  config: MCConfig,
  db: DrizzleDb
): Promise<number> {
  const rootPaths = (config.discovery?.paths ?? ["~"]).map(expandPath);
  const trackedPaths = getTrackedPaths(config, "local");
  const dismissedPaths = getDismissedPaths(db, "local");
  const limit = pLimit(5); // Limit concurrent git probes
  let newCount = 0;

  for (const rootPath of rootPaths) {
    if (!existsSync(rootPath)) {
      console.warn(`Discovery root path does not exist: ${rootPath}`);
      continue;
    }

    // Collect child directories
    const children: string[] = [];
    try {
      const dir = await opendir(rootPath);
      for await (const entry of dir) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".") && EXCLUDED_DIRS.has(entry.name))
          continue;
        if (EXCLUDED_DIRS.has(entry.name)) continue;

        const childPath = join(rootPath, entry.name);

        // Skip if already tracked in mc.config.json
        if (trackedPaths.has(childPath)) continue;

        // Skip if already dismissed
        if (dismissedPaths.has(childPath)) continue;

        children.push(childPath);
      }
    } catch (err) {
      console.warn(
        `Failed to read directory ${rootPath}:`,
        (err as Error).message
      );
      continue;
    }

    // Probe each child for git repo status in parallel (limited concurrency)
    const results = await Promise.allSettled(
      children.map((childPath) =>
        limit(async () => {
          const probeResult = await probeGitRepo(childPath);
          if (!probeResult) return null;

          // Cross-host dedup: skip if same repo already discovered on another host
          if (isAlreadyDiscoveredByRemoteUrl(db, probeResult.remoteUrl, "local")) {
            return null;
          }

          const name = basename(childPath);

          // Check if already in discoveries table as "found"
          const existing = getDiscoveryByPath(db, childPath, "local");
          const isNew = !existing;

          upsertDiscovery(db, {
            path: childPath,
            host: "local",
            remoteUrl: probeResult.remoteUrl,
            name,
            lastCommitAt: probeResult.lastCommitDate
              ? new Date(probeResult.lastCommitDate)
              : null,
          });

          if (isNew) {
            eventBus.emit("mc:event", {
              type: "discovery:found",
              id: childPath,
              data: {
                path: childPath,
                name,
                host: "local",
                remoteUrl: probeResult.remoteUrl,
              },
            });
            return "new";
          }

          return "updated";
        })
      )
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value === "new") {
        newCount++;
      }
    }
  }

  // SSH scan (non-fatal -- errors caught inside)
  const sshCount = config.discovery?.sshEnabled !== false
    ? await scanSshDiscoveries(config, db)
    : 0;
  newCount += sshCount;

  // GitHub org scan (non-fatal -- errors caught inside per-org)
  const githubCount = await scanGithubOrgDiscoveries(config, db);
  newCount += githubCount;

  return newCount;
}

/**
 * Scan Mac Mini repos via SSH.
 * Uses a single SSH command to find git repos and extract metadata.
 * SSH failure is non-fatal -- returns 0 on any error.
 */
export async function scanSshDiscoveries(
  config: MCConfig,
  db: DrizzleDb
): Promise<number> {
  const sshHost = config.macMiniSshHost ?? "mac-mini-host";
  const trackedPaths = getTrackedPaths(config, "mac-mini");
  const dismissedPaths = getDismissedPaths(db, "mac-mini");

  try {
    // Single SSH command: find git repos, extract remote URL and last commit date
    const sshScript = [
      'find /Users/ryanstern -maxdepth 2 -name .git -type d 2>/dev/null',
      '| while read gitdir; do',
      '  dir=$(dirname "$gitdir");',
      '  echo "===REPO===";',
      '  echo "$dir";',
      '  git -C "$dir" remote get-url origin 2>/dev/null || echo "";',
      '  git -C "$dir" log -1 --format=%aI 2>/dev/null || echo "";',
      'done',
    ].join(' ');

    const result = await execFile(
      "ssh",
      ["-o", `ConnectTimeout=${SSH_CONNECT_TIMEOUT}`, sshHost, sshScript],
      { timeout: SSH_CMD_TIMEOUT }
    );

    const blocks = result.stdout
      .split("===REPO===")
      .map((b) => b.trim())
      .filter(Boolean);

    let newCount = 0;

    for (const block of blocks) {
      const lines = block.split("\n").map((l) => l.trim());
      const path = lines[0] ?? "";
      const remoteUrl = lines[1] || null;
      const lastCommitStr = lines[2] || null;

      if (!path) continue;

      // Skip tracked or dismissed paths
      if (trackedPaths.has(path)) continue;
      if (dismissedPaths.has(path)) continue;

      // Cross-host dedup: skip if same repo already discovered on another host
      if (isAlreadyDiscoveredByRemoteUrl(db, remoteUrl, "mac-mini")) continue;

      const name = basename(path);
      const lastCommitAt = lastCommitStr ? new Date(lastCommitStr) : null;

      // Check if already in discoveries table
      const existing = getDiscoveryByPath(db, path, "mac-mini");
      const isNew = !existing;

      upsertDiscovery(db, {
        path,
        host: "mac-mini",
        remoteUrl,
        name,
        lastCommitAt,
      });

      if (isNew) {
        eventBus.emit("mc:event", {
          type: "discovery:found",
          id: path,
          data: { path, name, host: "mac-mini", remoteUrl },
        });
        newCount++;
      }
    }

    return newCount;
  } catch (err) {
    console.warn("SSH discovery scan failed:", (err as Error).message);
    return 0;
  }
}

/**
 * List repos from configured GitHub orgs via `gh api`.
 * Each org is scanned independently -- one failing org doesn't block others.
 * Returns total new discoveries across all orgs.
 */
export async function scanGithubOrgDiscoveries(
  config: MCConfig,
  db: DrizzleDb
): Promise<number> {
  const orgs = config.discovery?.githubOrgs ?? [];
  if (orgs.length === 0) return 0;

  const trackedRepos = getTrackedGithubRepos(config);
  const dismissedPaths = getDismissedPaths(db, "github");
  let totalNew = 0;

  for (const org of orgs) {
    try {
      const result = await execFile(
        "gh",
        [
          "api",
          `orgs/${org}/repos`,
          "--paginate",
          "--jq",
          '.[] | .full_name + "|" + (.description // "") + "|" + (.html_url // "") + "|" + (.pushed_at // "")',
        ],
        { timeout: GH_API_TIMEOUT }
      );

      const lines = result.stdout.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        const parts = line.split("|");
        const fullName = parts[0] ?? "";
        // parts[1] is description (unused for now)
        const htmlUrl = parts[2] || null;
        const pushedAt = parts[3] || null;

        if (!fullName) continue;

        // Skip if tracked in mc.config.json
        if (trackedRepos.has(fullName.toLowerCase())) continue;

        // Skip if dismissed (path for github discoveries is fullName)
        if (dismissedPaths.has(fullName)) continue;

        // Cross-host dedup: skip if same repo already discovered on another host
        if (isAlreadyDiscoveredByRemoteUrl(db, htmlUrl, "github")) continue;

        const name = fullName.split("/")[1] ?? fullName;
        const lastCommitAt = pushedAt ? new Date(pushedAt) : null;

        // Check if already in discoveries table
        const existing = getDiscoveryByPath(db, fullName, "github");
        const isNew = !existing;

        upsertDiscovery(db, {
          path: fullName,
          host: "github",
          remoteUrl: htmlUrl,
          name,
          lastCommitAt,
        });

        if (isNew) {
          eventBus.emit("mc:event", {
            type: "discovery:found",
            id: fullName,
            data: { path: fullName, name, host: "github", remoteUrl: htmlUrl },
          });
          totalNew++;
        }
      }
    } catch (err) {
      console.warn(
        `GitHub org scan failed for ${org}:`,
        (err as Error).message
      );
    }
  }

  return totalNew;
}

/**
 * Derive a URL-safe slug from a repo directory name.
 * Converts to lowercase, replaces non-alphanumeric with hyphens, trims hyphens.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Promote a discovered repo to a tracked project.
 *
 * 1. Updates discovery status to "tracked"
 * 2. Atomically writes to mc.config.json (tmp file + rename)
 * 3. Inserts into projects table
 * 4. Triggers a single-project scan so it appears on departure board
 * 5. Emits discovery:promoted SSE event
 */
export async function promoteDiscovery(
  discoveryId: string,
  db: DrizzleDb,
  _config: MCConfig,
  configPath: string
): Promise<void> {
  const discovery = getDiscovery(db, discoveryId);

  if (discovery.status !== "found") {
    throw new Error(
      `Discovery ${discoveryId} is already ${discovery.status}`
    );
  }

  const slug = slugify(discovery.name ?? basename(discovery.path));
  const name = discovery.name ?? basename(discovery.path);

  // 1. Update discovery status
  updateDiscoveryStatus(db, discoveryId, "tracked");

  // 2. Atomic mc.config.json write
  const configContent = readFileSync(configPath, "utf-8");
  const configJson = JSON.parse(configContent) as Record<string, unknown>;
  const projects = (configJson.projects ?? []) as Array<
    Record<string, unknown>
  >;

  // Check slug uniqueness -- if collision, append a suffix
  const existingSlugs = new Set(projects.map((p) => p.slug));
  let finalSlug = slug;
  let suffix = 2;
  while (existingSlugs.has(finalSlug)) {
    finalSlug = `${slug}-${suffix}`;
    suffix++;
  }

  projects.push({
    name,
    slug: finalSlug,
    path: discovery.path,
    host: discovery.host,
  });

  configJson.projects = projects;
  const tmpPath = configPath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(configJson, null, 2) + "\n", "utf-8");
  renameSync(tmpPath, configPath);

  // 3. Insert into projects table
  upsertProject(db, {
    slug: finalSlug,
    name,
    tagline: null,
    path: discovery.path,
    host: discovery.host as "local" | "mac-mini" | "github",
    lastScannedAt: null,
  });

  // 4. Trigger single-project scan (async, don't await)
  scanProject(discovery.path).catch(() => {
    // Non-fatal -- project will be picked up on next regular scan cycle
  });

  // 5. Emit SSE event
  eventBus.emit("mc:event", {
    type: "discovery:promoted",
    id: discoveryId,
    data: {
      slug: finalSlug,
      name,
      path: discovery.path,
      host: discovery.host,
    },
  });
}

/**
 * Dismiss a discovered repo permanently.
 * Sets status to "dismissed" -- scanner will skip it in future scans.
 */
export function dismissDiscovery(
  discoveryId: string,
  db: DrizzleDb
): void {
  const discovery = getDiscovery(db, discoveryId);

  if (discovery.status !== "found") {
    throw new Error(
      `Discovery ${discoveryId} is already ${discovery.status}`
    );
  }

  updateDiscoveryStatus(db, discoveryId, "dismissed");

  eventBus.emit("mc:event", {
    type: "discovery:dismissed",
    id: discoveryId,
    data: {
      path: discovery.path,
      name: discovery.name,
    },
  });
}

/**
 * Start background discovery scanner on its own independent timer.
 * Returns the timer handle for cleanup.
 */
export function startDiscoveryScanner(
  config: MCConfig,
  db: DrizzleDb,
  intervalMs?: number
): ReturnType<typeof setInterval> {
  const interval =
    intervalMs ?? (config.discovery?.scanIntervalMinutes ?? 60) * 60_000;

  // Run initial scan
  scanForDiscoveries(config, db)
    .then((count) => {
      if (count > 0) {
        console.log(`Discovery scan found ${count} new repo(s)`);
      }
    })
    .catch((err) => {
      console.error("Initial discovery scan failed:", err);
    });

  // Set up recurring scan
  return setInterval(() => {
    scanForDiscoveries(config, db)
      .then((count) => {
        if (count > 0) {
          console.log(`Discovery scan found ${count} new repo(s)`);
        }
      })
      .catch((err) => {
        console.error("Discovery scan failed:", err);
      });
  }, interval);
}
