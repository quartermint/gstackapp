import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("node:os", async () => {
  const actual = await vi.importActual("node:os");
  return {
    ...actual,
    homedir: vi.fn(),
  };
});

import { homedir } from "node:os";
const mockHomedir = vi.mocked(homedir);

describe("queue", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `mc-queue-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    mockHomedir.mockReturnValue(tempDir);
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("readQueue returns empty array when no queue file", async () => {
    const { readQueue } = await import("../queue.js");
    expect(readQueue()).toEqual([]);
  });

  it("enqueue creates queue.jsonl with entry", async () => {
    const { enqueue, readQueue } = await import("../queue.js");
    enqueue({ rawContent: "test thought", queuedAt: "2026-01-01T00:00:00Z" });
    const items = readQueue();
    expect(items).toHaveLength(1);
    expect(items[0].rawContent).toBe("test thought");
    expect(items[0].queuedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("enqueue appends multiple entries", async () => {
    const { enqueue, readQueue } = await import("../queue.js");
    enqueue({ rawContent: "first", queuedAt: "2026-01-01T00:00:00Z" });
    enqueue({ rawContent: "second", queuedAt: "2026-01-01T00:01:00Z" });
    const items = readQueue();
    expect(items).toHaveLength(2);
    expect(items[0].rawContent).toBe("first");
    expect(items[1].rawContent).toBe("second");
  });

  it("clearQueue removes the file", async () => {
    const { enqueue, clearQueue } = await import("../queue.js");
    enqueue({ rawContent: "test", queuedAt: "2026-01-01T00:00:00Z" });
    clearQueue();
    const queuePath = join(tempDir, ".mc", "queue.jsonl");
    expect(existsSync(queuePath)).toBe(false);
  });

  it("queueCount returns 0 when no file", async () => {
    const { queueCount } = await import("../queue.js");
    expect(queueCount()).toBe(0);
  });

  it("queueCount returns correct count", async () => {
    const { enqueue, queueCount } = await import("../queue.js");
    enqueue({ rawContent: "one", queuedAt: "2026-01-01T00:00:00Z" });
    enqueue({ rawContent: "two", queuedAt: "2026-01-01T00:01:00Z" });
    expect(queueCount()).toBe(2);
  });

  it("enqueue preserves optional projectId", async () => {
    const { enqueue, readQueue } = await import("../queue.js");
    enqueue({ rawContent: "thought", projectId: "mission-control", queuedAt: "2026-01-01T00:00:00Z" });
    const items = readQueue();
    expect(items[0].projectId).toBe("mission-control");
  });
});
