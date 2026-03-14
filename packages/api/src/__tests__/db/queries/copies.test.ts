import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../../helpers/setup.js";
import type { DatabaseInstance } from "../../../db/index.js";
import {
  upsertCopy,
  getCopiesByProject,
  getCopiesByRemoteUrl,
} from "../../../db/queries/copies.js";

describe("Project copy queries", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("upsertCopy", () => {
    it("inserts a new copy with lastCheckedAt", () => {
      upsertCopy(instance.db, {
        projectSlug: "mission-control",
        host: "local",
        path: "/Users/ryanstern/mission-control",
        remoteUrl: "git@github.com:quartermint/mission-control.git",
        headCommit: "abc1234",
        branch: "main",
        isPublic: false,
      });

      const copies = getCopiesByProject(instance.db, "mission-control");
      expect(copies.length).toBe(1);
      expect(copies[0]!.projectSlug).toBe("mission-control");
      expect(copies[0]!.host).toBe("local");
      expect(copies[0]!.path).toBe("/Users/ryanstern/mission-control");
      expect(copies[0]!.remoteUrl).toBe("git@github.com:quartermint/mission-control.git");
      expect(copies[0]!.headCommit).toBe("abc1234");
      expect(copies[0]!.branch).toBe("main");
      expect(copies[0]!.isPublic).toBe(false);
      expect(copies[0]!.lastCheckedAt).toBeTruthy();
    });

    it("upserts existing copy (same slug+host) updating all fields", () => {
      upsertCopy(instance.db, {
        projectSlug: "mission-control",
        host: "local",
        path: "/Users/ryanstern/new-location/mission-control",
        remoteUrl: "git@github.com:quartermint/mission-control.git",
        headCommit: "def5678",
        branch: "develop",
        isPublic: true,
      });

      const copies = getCopiesByProject(instance.db, "mission-control");
      expect(copies.length).toBe(1); // Same row, not a new one
      expect(copies[0]!.path).toBe("/Users/ryanstern/new-location/mission-control");
      expect(copies[0]!.headCommit).toBe("def5678");
      expect(copies[0]!.branch).toBe("develop");
      expect(copies[0]!.isPublic).toBe(true);
    });

    it("creates separate copies for different hosts", () => {
      upsertCopy(instance.db, {
        projectSlug: "mission-control",
        host: "mac-mini",
        path: "/Users/ryanstern/mission-control",
        remoteUrl: "git@github.com:quartermint/mission-control.git",
        headCommit: "ghi9012",
        branch: "main",
      });

      const copies = getCopiesByProject(instance.db, "mission-control");
      expect(copies.length).toBe(2);
      const hosts = copies.map((c) => c.host).sort();
      expect(hosts).toEqual(["local", "mac-mini"]);
    });
  });

  describe("getCopiesByProject", () => {
    it("returns all copies for a slug", () => {
      const copies = getCopiesByProject(instance.db, "mission-control");
      expect(copies.length).toBe(2);
      for (const copy of copies) {
        expect(copy.projectSlug).toBe("mission-control");
      }
    });

    it("returns empty array for unknown slug", () => {
      const copies = getCopiesByProject(instance.db, "nonexistent");
      expect(copies).toEqual([]);
    });
  });

  describe("getCopiesByRemoteUrl", () => {
    it("returns copies matching a remote URL", () => {
      const copies = getCopiesByRemoteUrl(
        instance.db,
        "git@github.com:quartermint/mission-control.git"
      );
      expect(copies.length).toBe(2);
      for (const copy of copies) {
        expect(copy.remoteUrl).toBe("git@github.com:quartermint/mission-control.git");
      }
    });

    it("returns empty array for unknown remote URL", () => {
      const copies = getCopiesByRemoteUrl(instance.db, "git@github.com:unknown/repo.git");
      expect(copies).toEqual([]);
    });
  });
});
