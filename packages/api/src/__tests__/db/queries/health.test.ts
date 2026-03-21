import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../../helpers/setup.js";
import type { DatabaseInstance } from "../../../db/index.js";
import {
  upsertHealthFinding,
  getActiveFindings,
  resolveFindings,
  getProjectRiskLevel,
} from "../../../db/queries/health.js";

describe("Health finding queries", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("upsertHealthFinding", () => {
    it("inserts a new finding with fresh detectedAt", () => {
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "mission-control",
        checkType: "unpushed_commits",
        severity: "warning",
        detail: "3 commits ahead of origin/main",
      });

      const findings = getActiveFindings(instance.db, "mission-control");
      expect(findings.length).toBe(1);
      expect(findings[0]!.projectSlug).toBe("mission-control");
      expect(findings[0]!.checkType).toBe("unpushed_commits");
      expect(findings[0]!.severity).toBe("warning");
      expect(findings[0]!.detail).toBe("3 commits ahead of origin/main");
      expect(findings[0]!.detectedAt).toBeTruthy();
      expect(findings[0]!.resolvedAt).toBeNull();
    });

    it("preserves original detectedAt when upserting existing active finding", () => {
      // Insert a finding with a known old timestamp (4 days ago)
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
      instance.sqlite.prepare(`
        INSERT INTO project_health (project_slug, check_type, severity, detail, detected_at)
        VALUES (?, ?, ?, ?, ?)
      `).run("test-project", "dirty_working_tree", "info", "old detail", fourDaysAgo);

      // Upsert with updated severity and detail
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "test-project",
        checkType: "dirty_working_tree",
        severity: "warning",
        detail: "updated detail with more info",
      });

      const findings = getActiveFindings(instance.db, "test-project");
      const finding = findings.find((f) => f.checkType === "dirty_working_tree");
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe("warning");
      expect(finding!.detail).toBe("updated detail with more info");
      // CRITICAL: detectedAt must be preserved from original insert
      expect(finding!.detectedAt).toBe(fourDaysAgo);
    });

    it("creates separate finding for different checkType (not update)", () => {
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "test-project",
        checkType: "no_remote",
        severity: "critical",
        detail: "no remote configured",
      });

      const findings = getActiveFindings(instance.db, "test-project");
      expect(findings.length).toBe(2);
      const types = findings.map((f) => f.checkType).sort();
      expect(types).toEqual(["dirty_working_tree", "no_remote"]);
    });

    it("stores metadata as JSON when provided", () => {
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "meta-project",
        checkType: "unpushed_commits",
        severity: "info",
        detail: "1 commit ahead",
        metadata: { commitCount: 1, branch: "main" },
      });

      const findings = getActiveFindings(instance.db, "meta-project");
      expect(findings.length).toBe(1);
      expect(findings[0]!.metadata).toEqual({ commitCount: 1, branch: "main" });
    });
  });

  describe("resolveFindings", () => {
    it("marks active findings as resolved with resolvedAt timestamp", () => {
      // Setup: insert a finding for a fresh project
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "resolve-test",
        checkType: "broken_tracking",
        severity: "critical",
        detail: "branch tracking broken",
      });

      // Resolve all findings (empty activeCheckTypes)
      resolveFindings(instance.sqlite, "resolve-test", []);

      const active = getActiveFindings(instance.db, "resolve-test");
      expect(active.length).toBe(0);

      // Verify the finding has resolvedAt set
      const all = instance.sqlite
        .prepare("SELECT * FROM project_health WHERE project_slug = ?")
        .all("resolve-test") as Array<{ resolved_at: string | null }>;
      expect(all.length).toBe(1);
      expect(all[0]!.resolved_at).toBeTruthy();
    });

    it("only resolves check types NOT in the active set", () => {
      // Setup: insert two findings
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "selective-resolve",
        checkType: "unpushed_commits",
        severity: "warning",
        detail: "2 commits ahead",
      });
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "selective-resolve",
        checkType: "dirty_working_tree",
        severity: "info",
        detail: "uncommitted changes",
      });

      // Resolve only findings NOT in the active set (unpushed_commits stays active)
      resolveFindings(instance.sqlite, "selective-resolve", ["unpushed_commits"]);

      const active = getActiveFindings(instance.db, "selective-resolve");
      expect(active.length).toBe(1);
      expect(active[0]!.checkType).toBe("unpushed_commits");
    });

    it("re-detecting an issue after resolution creates a new row", () => {
      // Setup: insert and resolve a finding
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "redetect-test",
        checkType: "no_remote",
        severity: "critical",
        detail: "no remote v1",
      });
      resolveFindings(instance.sqlite, "redetect-test", []);

      // Re-detect the same issue
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "redetect-test",
        checkType: "no_remote",
        severity: "critical",
        detail: "no remote v2",
      });

      // Should have one active finding
      const active = getActiveFindings(instance.db, "redetect-test");
      expect(active.length).toBe(1);
      expect(active[0]!.detail).toBe("no remote v2");

      // Should have two total rows (one resolved, one active)
      const all = instance.sqlite
        .prepare("SELECT * FROM project_health WHERE project_slug = ?")
        .all("redetect-test") as Array<{ resolved_at: string | null }>;
      expect(all.length).toBe(2);
    });
  });

  describe("getActiveFindings", () => {
    it("returns only findings where resolvedAt IS NULL", () => {
      const active = getActiveFindings(instance.db);
      for (const finding of active) {
        expect(finding.resolvedAt).toBeNull();
      }
    });

    it("filters by projectSlug when provided", () => {
      const findings = getActiveFindings(instance.db, "mission-control");
      for (const finding of findings) {
        expect(finding.projectSlug).toBe("mission-control");
      }
    });

    it("returns all active findings when no projectSlug provided", () => {
      const all = getActiveFindings(instance.db);
      // Should include findings from multiple projects
      const slugs = new Set(all.map((f) => f.projectSlug));
      expect(slugs.size).toBeGreaterThan(1);
    });
  });

  describe("getProjectRiskLevel", () => {
    it("returns 'healthy' when no active findings exist", () => {
      const level = getProjectRiskLevel(instance.db, "nonexistent-project");
      expect(level).toBe("healthy");
    });

    it("returns 'critical' when worst active severity is critical", () => {
      const level = getProjectRiskLevel(instance.db, "test-project");
      // test-project has a "critical" finding (no_remote)
      expect(level).toBe("critical");
    });

    it("returns 'warning' when worst active severity is warning", () => {
      // selective-resolve only has unpushed_commits (warning) active
      const level = getProjectRiskLevel(instance.db, "selective-resolve");
      expect(level).toBe("warning");
    });

    it("returns 'healthy' when worst active severity is info", () => {
      // Setup: create a project with only info-severity findings
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "info-only",
        checkType: "unpulled_commits",
        severity: "info",
        detail: "1 commit behind",
      });

      const level = getProjectRiskLevel(instance.db, "info-only");
      expect(level).toBe("healthy");
    });
  });

  describe("new health check types (v1.4)", () => {
    it("accepts checkType 'dependency_impact' without error", () => {
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "dep-impact-test",
        checkType: "dependency_impact",
        severity: "warning",
        detail: "upstream dependency changed",
      });

      const findings = getActiveFindings(instance.db, "dep-impact-test");
      expect(findings.length).toBe(1);
      expect(findings[0]!.checkType).toBe("dependency_impact");
    });

    it("accepts checkType 'convention_violation' without error", () => {
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "conv-violation-test",
        checkType: "convention_violation",
        severity: "info",
        detail: "CLAUDE.md missing required section",
      });

      const findings = getActiveFindings(instance.db, "conv-violation-test");
      expect(findings.length).toBe(1);
      expect(findings[0]!.checkType).toBe("convention_violation");
    });

    it("accepts checkType 'stale_knowledge' without error", () => {
      upsertHealthFinding(instance.db, instance.sqlite, {
        projectSlug: "stale-knowledge-test",
        checkType: "stale_knowledge",
        severity: "warning",
        detail: "CLAUDE.md not updated in 30 days despite 15 commits",
      });

      const findings = getActiveFindings(instance.db, "stale-knowledge-test");
      expect(findings.length).toBe(1);
      expect(findings[0]!.checkType).toBe("stale_knowledge");
    });

    it("returns findings with new check types via getActiveFindings", () => {
      const findings = getActiveFindings(instance.db);
      const newTypes = findings
        .map((f) => f.checkType)
        .filter((t) =>
          ["dependency_impact", "convention_violation", "stale_knowledge"].includes(t)
        );
      expect(newTypes.length).toBeGreaterThanOrEqual(3);
    });
  });
});
