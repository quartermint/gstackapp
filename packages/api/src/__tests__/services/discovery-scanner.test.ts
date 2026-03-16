import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import {
  upsertDiscovery,
  listDiscoveries,
  getDismissedPaths,
  getDiscovery,
  updateDiscoveryStatus,
} from "../../db/queries/discoveries.js";

describe("discovery-scanner", () => {
  describe("module exports", () => {
    it("exports all expected functions", async () => {
      const mod = await import("../../services/discovery-scanner.js");
      expect(typeof mod.scanForDiscoveries).toBe("function");
      expect(typeof mod.promoteDiscovery).toBe("function");
      expect(typeof mod.dismissDiscovery).toBe("function");
      expect(typeof mod.startDiscoveryScanner).toBe("function");
    });
  });

  describe("discovery query functions", () => {
    let instance: DatabaseInstance;

    beforeEach(() => {
      instance = createTestDb();
    });

    afterEach(() => {
      instance.sqlite.close();
    });

    it("upsertDiscovery inserts a new discovery", () => {
      upsertDiscovery(instance.db, {
        path: "/Users/test/my-project",
        host: "local",
        remoteUrl: "https://github.com/test/my-project.git",
        name: "my-project",
        lastCommitAt: new Date("2026-03-15T10:00:00Z"),
      });

      const results = listDiscoveries(instance.db);
      expect(results).toHaveLength(1);
      expect(results[0]!.path).toBe("/Users/test/my-project");
      expect(results[0]!.name).toBe("my-project");
      expect(results[0]!.status).toBe("found");
      expect(results[0]!.host).toBe("local");
    });

    it("upsertDiscovery updates metadata on conflict without overwriting status", () => {
      // Insert initial discovery
      upsertDiscovery(instance.db, {
        path: "/Users/test/my-project",
        host: "local",
        remoteUrl: null,
        name: "my-project",
        lastCommitAt: null,
      });

      // Dismiss it
      const initial = listDiscoveries(instance.db);
      updateDiscoveryStatus(instance.db, initial[0]!.id, "dismissed");

      // Upsert again with updated metadata
      upsertDiscovery(instance.db, {
        path: "/Users/test/my-project",
        host: "local",
        remoteUrl: "https://github.com/test/my-project.git",
        name: "my-project-renamed",
        lastCommitAt: new Date("2026-03-16T10:00:00Z"),
      });

      // Status should still be dismissed, metadata updated
      const results = listDiscoveries(instance.db, { status: "dismissed" });
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe("my-project-renamed");
      expect(results[0]!.remoteUrl).toBe(
        "https://github.com/test/my-project.git"
      );
    });

    it("getDismissedPaths returns only dismissed paths for given host", () => {
      // Insert two discoveries
      upsertDiscovery(instance.db, {
        path: "/Users/test/project-a",
        host: "local",
        remoteUrl: null,
        name: "project-a",
        lastCommitAt: null,
      });
      upsertDiscovery(instance.db, {
        path: "/Users/test/project-b",
        host: "local",
        remoteUrl: null,
        name: "project-b",
        lastCommitAt: null,
      });

      // Dismiss only project-a
      const all = listDiscoveries(instance.db);
      const projectA = all.find((d) => d.name === "project-a")!;
      updateDiscoveryStatus(instance.db, projectA.id, "dismissed");

      const dismissed = getDismissedPaths(instance.db, "local");
      expect(dismissed.size).toBe(1);
      expect(dismissed.has("/Users/test/project-a")).toBe(true);
      expect(dismissed.has("/Users/test/project-b")).toBe(false);
    });

    it("listDiscoveries filters by status", () => {
      upsertDiscovery(instance.db, {
        path: "/Users/test/found-repo",
        host: "local",
        remoteUrl: null,
        name: "found-repo",
        lastCommitAt: null,
      });
      upsertDiscovery(instance.db, {
        path: "/Users/test/dismissed-repo",
        host: "local",
        remoteUrl: null,
        name: "dismissed-repo",
        lastCommitAt: null,
      });

      const all = listDiscoveries(instance.db);
      const dismissed = all.find((d) => d.name === "dismissed-repo")!;
      updateDiscoveryStatus(instance.db, dismissed.id, "dismissed");

      const found = listDiscoveries(instance.db, { status: "found" });
      expect(found).toHaveLength(1);
      expect(found[0]!.name).toBe("found-repo");

      const dismissedList = listDiscoveries(instance.db, {
        status: "dismissed",
      });
      expect(dismissedList).toHaveLength(1);
      expect(dismissedList[0]!.name).toBe("dismissed-repo");
    });

    it("listDiscoveries filters by host", () => {
      upsertDiscovery(instance.db, {
        path: "/Users/test/local-repo",
        host: "local",
        remoteUrl: null,
        name: "local-repo",
        lastCommitAt: null,
      });
      upsertDiscovery(instance.db, {
        path: "/Users/mini/remote-repo",
        host: "mac-mini",
        remoteUrl: null,
        name: "remote-repo",
        lastCommitAt: null,
      });

      const localOnly = listDiscoveries(instance.db, { host: "local" });
      expect(localOnly).toHaveLength(1);
      expect(localOnly[0]!.name).toBe("local-repo");
    });

    it("getDiscovery throws NOT_FOUND for non-existent id", () => {
      expect(() => getDiscovery(instance.db, "non-existent-id")).toThrow(
        /not found/i
      );
    });

    it("updateDiscoveryStatus changes status correctly", () => {
      upsertDiscovery(instance.db, {
        path: "/Users/test/status-repo",
        host: "local",
        remoteUrl: null,
        name: "status-repo",
        lastCommitAt: null,
      });

      const all = listDiscoveries(instance.db);
      const discovery = all[0]!;
      expect(discovery.status).toBe("found");

      const updated = updateDiscoveryStatus(
        instance.db,
        discovery.id,
        "dismissed"
      );
      expect(updated.status).toBe("dismissed");
    });
  });

  describe("dismissDiscovery service function", () => {
    let instance: DatabaseInstance;

    beforeEach(() => {
      instance = createTestDb();
    });

    afterEach(() => {
      instance.sqlite.close();
    });

    it("sets status to dismissed and emits SSE event", async () => {
      const { dismissDiscovery } = await import(
        "../../services/discovery-scanner.js"
      );
      const { eventBus } = await import("../../services/event-bus.js");

      // Insert a discovery
      upsertDiscovery(instance.db, {
        path: "/Users/test/dismiss-me",
        host: "local",
        remoteUrl: null,
        name: "dismiss-me",
        lastCommitAt: null,
      });

      const all = listDiscoveries(instance.db);
      const id = all[0]!.id;

      // Listen for SSE event
      const events: unknown[] = [];
      const handler = (event: unknown) => events.push(event);
      eventBus.on("mc:event", handler);

      dismissDiscovery(id, instance.db);

      eventBus.removeListener("mc:event", handler);

      // Verify status changed
      const updated = getDiscovery(instance.db, id);
      expect(updated.status).toBe("dismissed");

      // Verify SSE event emitted
      expect(events).toHaveLength(1);
      expect((events[0] as Record<string, unknown>).type).toBe(
        "discovery:dismissed"
      );
    });

    it("throws when trying to dismiss a non-found discovery", async () => {
      const { dismissDiscovery } = await import(
        "../../services/discovery-scanner.js"
      );

      // Insert and dismiss
      upsertDiscovery(instance.db, {
        path: "/Users/test/already-dismissed",
        host: "local",
        remoteUrl: null,
        name: "already-dismissed",
        lastCommitAt: null,
      });

      const all = listDiscoveries(instance.db);
      const id = all[0]!.id;
      updateDiscoveryStatus(instance.db, id, "dismissed");

      expect(() => dismissDiscovery(id, instance.db)).toThrow(/already/);
    });
  });

  describe("startDiscoveryScanner", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("returns a timer handle that can be cleared", async () => {
      const { startDiscoveryScanner } = await import(
        "../../services/discovery-scanner.js"
      );
      const instance = createTestDb();

      // Provide a config with empty projects and no discovery paths
      const mockConfig = {
        projects: [],
        discovery: { paths: ["/nonexistent-test-path"], scanIntervalMinutes: 1 },
      } as unknown as import("../../lib/config.js").MCConfig;

      const timer = startDiscoveryScanner(
        mockConfig,
        instance.db,
        60_000 // 1 minute interval
      );

      expect(timer).toBeDefined();
      clearInterval(timer);
      instance.sqlite.close();
    });
  });
});
