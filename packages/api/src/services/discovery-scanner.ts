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
} from "../db/queries/discoveries.js";
import { upsertProject } from "../db/queries/projects.js";
import { scanProject } from "./project-scanner.js";
import { eventBus } from "./event-bus.js";
import type { MCConfig } from "../lib/config.js";
import type { DrizzleDb } from "../db/index.js";

const execFile = promisify(execFileCb);

const EXEC_TIMEOUT = 5_000; // 5 seconds for git commands during discovery

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
 * Extract all tracked local project paths from mc.config.json.
 * Handles both single-host and multi-copy entries.
 */
function getTrackedLocalPaths(config: MCConfig): Set<string> {
  const paths = new Set<string>();

  for (const entry of config.projects) {
    if ("copies" in entry) {
      // Multi-copy entry
      for (const copy of entry.copies) {
        if (copy.host === "local") {
          paths.add(copy.path);
        }
      }
    } else {
      // Single-host entry
      if (entry.host === "local" && entry.path) {
        paths.add(entry.path);
      }
    }
  }

  return paths;
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
 * Scan configured root directories for git repos not in mc.config.json.
 * Depth-1 only -- scans immediate children, never recursive.
 *
 * Returns the number of new discoveries found.
 */
export async function scanForDiscoveries(
  config: MCConfig,
  db: DrizzleDb
): Promise<number> {
  const rootPaths = (config.discovery?.paths ?? ["~"]).map(expandPath);
  const trackedPaths = getTrackedLocalPaths(config);
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

  return newCount;
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
