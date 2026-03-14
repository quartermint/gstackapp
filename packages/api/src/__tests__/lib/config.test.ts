import { describe, it, expect } from "vitest";
import {
  projectEntrySchema,
  multiCopyEntrySchema,
  projectConfigEntrySchema,
  mcConfigSchema,
} from "../../lib/config.js";

describe("Config schema", () => {
  describe("projectEntrySchema (single-host)", () => {
    it("parses a standard single-host entry", () => {
      const entry = {
        name: "Mission Control",
        slug: "mission-control",
        path: "/Users/ryanstern/mission-control",
        host: "local",
        tagline: "Personal operating environment",
      };

      const result = projectEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Mission Control");
        expect(result.data.slug).toBe("mission-control");
        expect(result.data.host).toBe("local");
      }
    });

    it("accepts entries without optional fields", () => {
      const entry = {
        name: "Test Project",
        slug: "test-project",
        path: "/tmp/test",
        host: "local",
      };

      const result = projectEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
    });
  });

  describe("multiCopyEntrySchema", () => {
    it("parses a multi-host entry with copies array", () => {
      const entry = {
        name: "Shared Project",
        slug: "shared-project",
        tagline: "Exists on both machines",
        copies: [
          { host: "local", path: "/Users/ryanstern/shared-project" },
          { host: "mac-mini", path: "/Users/ryanstern/shared-project" },
        ],
      };

      const result = multiCopyEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.copies.length).toBe(2);
        expect(result.data.copies[0]!.host).toBe("local");
        expect(result.data.copies[1]!.host).toBe("mac-mini");
      }
    });

    it("requires at least one copy", () => {
      const entry = {
        name: "Empty Copies",
        slug: "empty-copies",
        copies: [],
      };

      const result = multiCopyEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });
  });

  describe("projectConfigEntrySchema (union)", () => {
    it("parses a single-host entry", () => {
      const entry = {
        name: "Local Only",
        slug: "local-only",
        path: "/tmp/local",
        host: "local",
      };

      const result = projectConfigEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
    });

    it("parses a multi-host entry", () => {
      const entry = {
        name: "Multi Host",
        slug: "multi-host",
        copies: [
          { host: "local", path: "/tmp/local" },
          { host: "mac-mini", path: "/tmp/remote" },
        ],
      };

      const result = projectConfigEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
    });

    it("rejects an entry with neither host/path nor copies", () => {
      const entry = {
        name: "Invalid",
        slug: "invalid",
      };

      const result = projectConfigEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });
  });

  describe("mcConfigSchema", () => {
    it("handles mixed array (some single-host, some multi-host)", () => {
      const config = {
        projects: [
          {
            name: "Local Project",
            slug: "local-project",
            path: "/tmp/local",
            host: "local",
          },
          {
            name: "Multi Project",
            slug: "multi-project",
            copies: [
              { host: "local", path: "/tmp/local" },
              { host: "mac-mini", path: "/tmp/remote" },
            ],
          },
        ],
        dataDir: "./data",
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projects.length).toBe(2);
      }
    });

    it("parses a realistic config matching existing mc.config.json shape", () => {
      const config = {
        projects: [
          {
            name: "Mission Control",
            slug: "mission-control",
            path: "/Users/ryanstern/mission-control",
            host: "local",
            tagline: "Personal operating environment",
            repo: "quartermint/mission-control",
          },
          {
            name: "NexusClaw",
            slug: "nexusclaw",
            path: "/Users/ryanstern/nexusclaw",
            host: "local",
            tagline: "Native iOS client for ZeroClaw AI gateway",
          },
          {
            name: "OpenEFB",
            slug: "openefb",
            path: "/Users/ryanstern/openefb",
            host: "local",
          },
        ],
        dataDir: "./data",
        services: [
          { name: "Crawl4AI", port: 11235, host: "mac-mini-host" },
        ],
        macMiniSshHost: "mac-mini-host",
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projects.length).toBe(3);
        expect(result.data.services.length).toBe(1);
        expect(result.data.macMiniSshHost).toBe("mac-mini-host");
      }
    });

    it("applies defaults for optional fields", () => {
      const config = {
        projects: [],
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dataDir).toBe("./data");
        expect(result.data.services).toEqual([]);
        expect(result.data.macMiniSshHost).toBe("mac-mini-host");
      }
    });
  });
});
