import { describe, it, expect } from "vitest";
import {
  projectEntrySchema,
  multiCopyEntrySchema,
  projectConfigEntrySchema,
  mcConfigSchema,
  detectCycles,
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

  describe("modelTiers backward compatibility", () => {
    it("parses existing config without modelTiers key (backward compat)", () => {
      const config = {
        projects: [
          {
            name: "Mission Control",
            slug: "mission-control",
            path: "/Users/ryanstern/mission-control",
            host: "local",
          },
        ],
        dataDir: "./data",
        services: [],
        macMiniSshHost: "mac-mini-host",
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modelTiers).toEqual([
          { pattern: "^claude-opus", tier: "opus" },
          { pattern: "^claude-sonnet", tier: "sonnet" },
        ]);
      }
    });

    it("accepts custom modelTiers array", () => {
      const config = {
        projects: [],
        modelTiers: [
          { pattern: "^gpt-4", tier: "opus" },
          { pattern: "^claude-opus", tier: "opus" },
          { pattern: "^claude-sonnet", tier: "sonnet" },
        ],
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modelTiers).toHaveLength(3);
        expect(result.data.modelTiers[0]!.pattern).toBe("^gpt-4");
      }
    });

    it("rejects modelTiers entry with empty pattern", () => {
      const config = {
        projects: [],
        modelTiers: [{ pattern: "", tier: "opus" }],
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("dependsOn field", () => {
    it("accepts single-host entry with dependsOn array", () => {
      const entry = {
        name: "Frontend",
        slug: "frontend",
        path: "/tmp/frontend",
        host: "local",
        dependsOn: ["api", "shared-lib"],
      };

      const result = projectEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dependsOn).toEqual(["api", "shared-lib"]);
      }
    });

    it("defaults dependsOn to [] when not provided on single-host entry", () => {
      const entry = {
        name: "Standalone",
        slug: "standalone",
        path: "/tmp/standalone",
        host: "local",
      };

      const result = projectEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dependsOn).toEqual([]);
      }
    });

    it("accepts multi-copy entry with dependsOn array", () => {
      const entry = {
        name: "Shared Service",
        slug: "shared-service",
        dependsOn: ["core-lib"],
        copies: [
          { host: "local", path: "/tmp/shared" },
          { host: "mac-mini", path: "/tmp/shared" },
        ],
      };

      const result = multiCopyEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dependsOn).toEqual(["core-lib"]);
      }
    });

    it("defaults dependsOn to [] when not provided on multi-copy entry", () => {
      const entry = {
        name: "Multi No Deps",
        slug: "multi-no-deps",
        copies: [{ host: "local", path: "/tmp/multi" }],
      };

      const result = multiCopyEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dependsOn).toEqual([]);
      }
    });

    it("preserves dependsOn through projectConfigEntrySchema union for single-host", () => {
      const entry = {
        name: "Union Single",
        slug: "union-single",
        path: "/tmp/union",
        host: "local",
        dependsOn: ["dep-a"],
      };

      const result = projectConfigEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dependsOn).toEqual(["dep-a"]);
      }
    });

    it("preserves dependsOn through projectConfigEntrySchema union for multi-copy", () => {
      const entry = {
        name: "Union Multi",
        slug: "union-multi",
        dependsOn: ["dep-b"],
        copies: [{ host: "local", path: "/tmp/union-multi" }],
      };

      const result = projectConfigEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dependsOn).toEqual(["dep-b"]);
      }
    });

    it("parses full config with dependsOn on some projects", () => {
      const config = {
        projects: [
          {
            name: "Core",
            slug: "core",
            path: "/tmp/core",
            host: "local",
          },
          {
            name: "API",
            slug: "api",
            path: "/tmp/api",
            host: "local",
            dependsOn: ["core"],
          },
          {
            name: "Web",
            slug: "web",
            copies: [
              { host: "local", path: "/tmp/web" },
              { host: "mac-mini", path: "/tmp/web" },
            ],
            dependsOn: ["api", "core"],
          },
        ],
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projects[0]!.dependsOn).toEqual([]);
        expect(result.data.projects[1]!.dependsOn).toEqual(["core"]);
        expect(result.data.projects[2]!.dependsOn).toEqual(["api", "core"]);
      }
    });
  });

  describe("conventions config", () => {
    it("conventions array validates with all fields", () => {
      const config = {
        projects: [],
        conventions: [
          {
            id: "no-deprecated-models",
            pattern: "qwen3-8b",
            description: "Deprecated model reference",
            negativeContext: ["deprecated|replaced by"],
            severity: "warning",
            matchType: "must_not_match",
          },
        ],
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conventions).toHaveLength(1);
        expect(result.data.conventions[0]!.id).toBe("no-deprecated-models");
        expect(result.data.conventions[0]!.matchType).toBe("must_not_match");
      }
    });

    it("conventions defaults to empty array when omitted (backward compat)", () => {
      const config = {
        projects: [],
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conventions).toEqual([]);
      }
    });

    it("conventionOverrides on project entry defaults to empty array when omitted", () => {
      const entry = {
        name: "Test",
        slug: "test",
        path: "/tmp/test",
        host: "local",
      };

      const result = projectEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conventionOverrides).toEqual([]);
      }
    });

    it("conventionOverrides on multi-copy entry defaults to empty array when omitted", () => {
      const entry = {
        name: "Multi",
        slug: "multi",
        copies: [{ host: "local", path: "/tmp/multi" }],
      };

      const result = multiCopyEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conventionOverrides).toEqual([]);
      }
    });

    it("convention id validates kebab-case format", () => {
      const validConfig = {
        projects: [],
        conventions: [
          {
            id: "no-deprecated-models",
            pattern: "test",
            description: "Test rule",
          },
        ],
      };
      expect(mcConfigSchema.safeParse(validConfig).success).toBe(true);

      const invalidConfig = {
        projects: [],
        conventions: [
          {
            id: "No_Deprecated Models",
            pattern: "test",
            description: "Test rule",
          },
        ],
      };
      expect(mcConfigSchema.safeParse(invalidConfig).success).toBe(false);
    });

    it("invalid convention rule (missing id/pattern) rejected by schema", () => {
      const config = {
        projects: [],
        conventions: [
          {
            // missing id and pattern
            description: "Test rule",
          },
        ],
      };
      expect(mcConfigSchema.safeParse(config).success).toBe(false);
    });
  });

  describe("users registry", () => {
    it("defaults users to empty array when omitted (backward compat)", () => {
      const config = {
        projects: [],
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.users).toEqual([]);
      }
    });

    it("parses users array with all fields", () => {
      const config = {
        projects: [],
        users: [
          {
            id: "ryan",
            displayName: "Ryan",
            role: "owner",
            tailscaleLogin: "ryan@example.com",
          },
          {
            id: "bella",
            displayName: "Bella",
            role: "member",
          },
        ],
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.users).toHaveLength(2);
        expect(result.data.users![0]!.id).toBe("ryan");
        expect(result.data.users![0]!.role).toBe("owner");
        expect(result.data.users![0]!.tailscaleLogin).toBe("ryan@example.com");
        expect(result.data.users![1]!.id).toBe("bella");
        expect(result.data.users![1]!.role).toBe("member");
        expect(result.data.users![1]!.tailscaleLogin).toBeUndefined();
      }
    });

    it("rejects user with empty id", () => {
      const config = {
        projects: [],
        users: [
          { id: "", displayName: "Test", role: "member" },
        ],
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("rejects user with invalid role", () => {
      const config = {
        projects: [],
        users: [
          { id: "test", displayName: "Test", role: "admin" },
        ],
      };

      const result = mcConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("detectCycles", () => {
    it("returns null for acyclic graph", () => {
      const projects = [
        { name: "A", slug: "a", path: "/a", host: "local" as const, dependsOn: ["b"] },
        { name: "B", slug: "b", path: "/b", host: "local" as const, dependsOn: ["c"] },
        { name: "C", slug: "c", path: "/c", host: "local" as const, dependsOn: [] },
      ];
      expect(detectCycles(projects)).toBeNull();
    });

    it("returns cycle path for direct cycle (A -> B -> A)", () => {
      const projects = [
        { name: "A", slug: "a", path: "/a", host: "local" as const, dependsOn: ["b"] },
        { name: "B", slug: "b", path: "/b", host: "local" as const, dependsOn: ["a"] },
      ];
      const cycle = detectCycles(projects);
      expect(cycle).not.toBeNull();
      expect(cycle!.join(" -> ")).toContain("a");
      expect(cycle!.join(" -> ")).toContain("b");
    });

    it("returns cycle path for indirect cycle (A -> B -> C -> A)", () => {
      const projects = [
        { name: "A", slug: "a", path: "/a", host: "local" as const, dependsOn: ["b"] },
        { name: "B", slug: "b", path: "/b", host: "local" as const, dependsOn: ["c"] },
        { name: "C", slug: "c", path: "/c", host: "local" as const, dependsOn: ["a"] },
      ];
      const cycle = detectCycles(projects);
      expect(cycle).not.toBeNull();
      expect(cycle!.join(" -> ")).toContain("a");
      expect(cycle!.join(" -> ")).toContain("b");
      expect(cycle!.join(" -> ")).toContain("c");
    });

    it("handles isolated nodes (projects with no dependsOn) returning null", () => {
      const projects = [
        { name: "A", slug: "a", path: "/a", host: "local" as const, dependsOn: [] },
        { name: "B", slug: "b", path: "/b", host: "local" as const, dependsOn: [] },
        { name: "C", slug: "c", path: "/c", host: "local" as const, dependsOn: [] },
      ];
      expect(detectCycles(projects)).toBeNull();
    });

    it("handles dependsOn referencing unknown slugs without error", () => {
      const projects = [
        { name: "A", slug: "a", path: "/a", host: "local" as const, dependsOn: ["external-lib"] },
        { name: "B", slug: "b", path: "/b", host: "local" as const, dependsOn: ["a"] },
      ];
      expect(detectCycles(projects)).toBeNull();
    });
  });
});
