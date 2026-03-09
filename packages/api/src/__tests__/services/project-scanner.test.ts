import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TTLCache } from "../../services/cache.js";
import { scanProject } from "../../services/project-scanner.js";

// --- TTLCache Tests ---

describe("TTLCache", () => {
  it("stores and retrieves values", () => {
    const cache = new TTLCache<string>(60_000);
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("returns undefined for missing keys", () => {
    const cache = new TTLCache<string>(60_000);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("returns undefined for expired entries", () => {
    // TTL of 1ms should expire nearly immediately
    const cache = new TTLCache<string>(1);
    cache.set("key1", "value1");

    // Wait a small amount to ensure expiry
    const start = Date.now();
    while (Date.now() - start < 10) {
      // busy-wait
    }

    expect(cache.get("key1")).toBeUndefined();
  });

  it("invalidateAll clears all entries", () => {
    const cache = new TTLCache<string>(60_000);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.invalidateAll();
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });

  it("invalidate clears a single entry", () => {
    const cache = new TTLCache<string>(60_000);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.invalidate("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
  });
});

// --- scanProject Tests ---

describe("scanProject", () => {
  let tempRepo: string;

  beforeAll(() => {
    // Create a temporary git repo with a commit
    tempRepo = mkdtempSync(join(tmpdir(), "mc-test-repo-"));
    execSync("git init", { cwd: tempRepo });
    execSync('git config user.email "test@test.com"', { cwd: tempRepo });
    execSync('git config user.name "Test"', { cwd: tempRepo });
    writeFileSync(join(tempRepo, "README.md"), "# Test\n");
    execSync("git add .", { cwd: tempRepo });
    execSync('git commit -m "initial commit"', { cwd: tempRepo });
  });

  afterAll(() => {
    // Clean up temp directory
    execSync(`rm -rf "${tempRepo}"`);
  });

  it("returns git status for a valid repo", async () => {
    const result = await scanProject(tempRepo);
    expect(result).not.toBeNull();
    expect(result!.branch).toBeTruthy();
    expect(result!.dirty).toBe(false);
    expect(result!.dirtyFiles).toEqual([]);
    expect(result!.commits).toHaveLength(1);
    expect(result!.commits[0]!.message).toBe("initial commit");
  });

  it("detects dirty files", async () => {
    writeFileSync(join(tempRepo, "new-file.txt"), "dirty\n");
    const result = await scanProject(tempRepo);
    expect(result).not.toBeNull();
    expect(result!.dirty).toBe(true);
    expect(result!.dirtyFiles.length).toBeGreaterThan(0);
    // Clean up
    execSync(`rm "${join(tempRepo, "new-file.txt")}"`);
  });

  it("returns null for non-existent path", async () => {
    const result = await scanProject("/tmp/does-not-exist-xyz-12345");
    expect(result).toBeNull();
  });

  it("returns null for non-git directory", async () => {
    const nonGit = mkdtempSync(join(tmpdir(), "mc-non-git-"));
    const result = await scanProject(nonGit);
    expect(result).toBeNull();
    execSync(`rm -rf "${nonGit}"`);
  });

  it("reads GSD state from .planning/STATE.md if it exists", async () => {
    // Create a .planning/STATE.md in temp repo
    const planningDir = join(tempRepo, ".planning");
    mkdirSync(planningDir, { recursive: true });
    writeFileSync(
      join(planningDir, "STATE.md"),
      `---
gsd_state_version: 1.0
status: executing
stopped_at: "Completed 01-02-PLAN.md"
progress:
  percent: 42
---

# Project State
`
    );

    const result = await scanProject(tempRepo);
    expect(result).not.toBeNull();
    expect(result!.gsdState).not.toBeNull();
    expect(result!.gsdState!.status).toBe("executing");
    expect(result!.gsdState!.percent).toBe(42);

    // Clean up
    execSync(`rm -rf "${planningDir}"`);
  });
});
