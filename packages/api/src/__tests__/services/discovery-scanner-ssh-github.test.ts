/**
 * Tests for SSH scanning (scanSshDiscoveries) and GitHub org scanning
 * (scanGithubOrgDiscoveries) in the discovery-scanner service.
 *
 * These tests live in a separate file because they require hoisted vi.mock
 * for node:child_process, which would affect all tests in the same file.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { MCConfig } from "../../lib/config.js";

// Mock child_process before any module under test imports it.
// The discovery-scanner module does:
//   import { execFile as execFileCb } from "node:child_process"
//   const execFile = promisify(execFileCb)
//
// Node's real execFile has [Symbol(util.promisify.custom)] which makes
// promisify(execFile) return Promise<{stdout, stderr}>. We replicate
// this by setting the custom symbol on our mock so tests can configure
// the promisified behavior directly via mockExecFilePromise.
const { mockExecFilePromise, mockExecFileCb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { promisify } = require("node:util") as typeof import("node:util");
  const promiseMock = vi.fn();
  const cbMock = vi.fn();
  (cbMock as unknown as Record<symbol, unknown>)[promisify.custom] = promiseMock;
  return { mockExecFilePromise: promiseMock, mockExecFileCb: cbMock };
});
vi.mock("node:child_process", () => ({
  execFile: mockExecFileCb,
}));

import {
  upsertDiscovery,
  listDiscoveries,
  updateDiscoveryStatus,
} from "../../db/queries/discoveries.js";
import {
  scanSshDiscoveries,
  scanGithubOrgDiscoveries,
} from "../../services/discovery-scanner.js";

// ── SSH Discovery Scanner Tests ─────────────────────────────────────

describe("scanSshDiscoveries", () => {
  let instance: DatabaseInstance;

  beforeEach(() => {
    instance = createTestDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    instance.sqlite.close();
  });

  it("returns 0 and does not throw when SSH fails", async () => {
    mockExecFilePromise.mockRejectedValue(
      new Error("Connection timed out")
    );

    const config = {
      projects: [],
      macMiniSshHost: "mac-mini-host",
      discovery: {
        paths: ["~"],
        githubOrgs: [],
        scanIntervalMinutes: 60,
        starSyncIntervalHours: 6,
      },
    } as unknown as MCConfig;

    const count = await scanSshDiscoveries(config, instance.db);
    expect(count).toBe(0);
  });

  it("parses SSH batch output and creates discoveries", async () => {
    const sshOutput = [
      "===REPO===",
      "/Users/ryanstern/project-alpha",
      "https://github.com/user/project-alpha.git",
      "2026-03-15T10:00:00Z",
      "===REPO===",
      "/Users/ryanstern/project-beta",
      "",
      "2026-03-14T09:00:00Z",
    ].join("\n");

    mockExecFilePromise.mockResolvedValue({ stdout: sshOutput, stderr: "" });

    const config = {
      projects: [],
      macMiniSshHost: "mac-mini-host",
      discovery: {
        paths: ["~"],
        githubOrgs: [],
        scanIntervalMinutes: 60,
        starSyncIntervalHours: 6,
      },
    } as unknown as MCConfig;

    const count = await scanSshDiscoveries(config, instance.db);
    expect(count).toBe(2);

    const results = listDiscoveries(instance.db, { host: "mac-mini" });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.name).sort()).toEqual([
      "project-alpha",
      "project-beta",
    ]);
  });

  it("skips repos already tracked in mc.config.json as mac-mini", async () => {
    const sshOutput = [
      "===REPO===",
      "/Users/ryanstern/lifevault",
      "https://github.com/user/lifevault.git",
      "2026-03-15T10:00:00Z",
    ].join("\n");

    mockExecFilePromise.mockResolvedValue({ stdout: sshOutput, stderr: "" });

    const config = {
      projects: [
        {
          name: "LifeVault",
          slug: "lifevault",
          path: "/Users/ryanstern/lifevault",
          host: "mac-mini",
        },
      ],
      macMiniSshHost: "mac-mini-host",
      discovery: {
        paths: ["~"],
        githubOrgs: [],
        scanIntervalMinutes: 60,
        starSyncIntervalHours: 6,
      },
    } as unknown as MCConfig;

    const count = await scanSshDiscoveries(config, instance.db);
    expect(count).toBe(0);
  });

  it("skips repos already dismissed", async () => {
    // Pre-dismiss a path
    upsertDiscovery(instance.db, {
      path: "/Users/ryanstern/old-project",
      host: "mac-mini",
      remoteUrl: null,
      name: "old-project",
      lastCommitAt: null,
    });
    const all = listDiscoveries(instance.db);
    updateDiscoveryStatus(instance.db, all[0]!.id, "dismissed");

    const sshOutput = [
      "===REPO===",
      "/Users/ryanstern/old-project",
      "",
      "2026-03-15T10:00:00Z",
    ].join("\n");

    mockExecFilePromise.mockResolvedValue({ stdout: sshOutput, stderr: "" });

    const config = {
      projects: [],
      macMiniSshHost: "mac-mini-host",
      discovery: {
        paths: ["~"],
        githubOrgs: [],
        scanIntervalMinutes: 60,
        starSyncIntervalHours: 6,
      },
    } as unknown as MCConfig;

    const count = await scanSshDiscoveries(config, instance.db);
    expect(count).toBe(0);
  });
});

// ── GitHub Org Discovery Scanner Tests ──────────────────────────────

describe("scanGithubOrgDiscoveries", () => {
  let instance: DatabaseInstance;

  beforeEach(() => {
    instance = createTestDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    instance.sqlite.close();
  });

  it("returns 0 when no orgs configured", async () => {
    const config = {
      projects: [],
      discovery: {
        paths: [],
        githubOrgs: [],
        scanIntervalMinutes: 60,
        starSyncIntervalHours: 6,
      },
    } as unknown as MCConfig;

    const count = await scanGithubOrgDiscoveries(config, instance.db);
    expect(count).toBe(0);
  });

  it("parses gh API output and creates discoveries", async () => {
    const ghOutput = [
      "quartermint/new-repo|A new project|https://github.com/quartermint/new-repo|2026-03-16T12:00:00Z",
      "quartermint/another-repo|Another project|https://github.com/quartermint/another-repo|2026-03-15T08:00:00Z",
    ].join("\n");

    mockExecFilePromise.mockResolvedValue({ stdout: ghOutput, stderr: "" });

    const config = {
      projects: [],
      discovery: {
        paths: [],
        githubOrgs: ["quartermint"],
        scanIntervalMinutes: 60,
        starSyncIntervalHours: 6,
      },
    } as unknown as MCConfig;

    const count = await scanGithubOrgDiscoveries(config, instance.db);
    expect(count).toBe(2);

    const results = listDiscoveries(instance.db, { host: "github" });
    expect(results).toHaveLength(2);
  });

  it("skips repos already tracked in config", async () => {
    const ghOutput =
      "quartermint/mainline-ios|iOS app|https://github.com/quartermint/mainline-ios|2026-03-16T12:00:00Z\n";

    mockExecFilePromise.mockResolvedValue({ stdout: ghOutput, stderr: "" });

    const config = {
      projects: [
        {
          name: "Mainline iOS",
          slug: "mainline-ios",
          repo: "quartermint/mainline-ios",
          path: "",
          host: "github",
        },
      ],
      discovery: {
        paths: [],
        githubOrgs: ["quartermint"],
        scanIntervalMinutes: 60,
        starSyncIntervalHours: 6,
      },
    } as unknown as MCConfig;

    const count = await scanGithubOrgDiscoveries(config, instance.db);
    expect(count).toBe(0);
  });

  it("continues scanning remaining orgs when one org fails", async () => {
    // First call (badorg) rejects, second call (quartermint) resolves
    mockExecFilePromise
      .mockRejectedValueOnce(new Error("404 Not Found"))
      .mockResolvedValueOnce({
        stdout:
          "quartermint/good-repo|Good|https://github.com/quartermint/good-repo|2026-03-16T12:00:00Z\n",
        stderr: "",
      });

    const config = {
      projects: [],
      discovery: {
        paths: [],
        githubOrgs: ["badorg", "quartermint"],
        scanIntervalMinutes: 60,
        starSyncIntervalHours: 6,
      },
    } as unknown as MCConfig;

    const count = await scanGithubOrgDiscoveries(config, instance.db);
    expect(count).toBe(1); // badorg failed but quartermint succeeded
  });
});
