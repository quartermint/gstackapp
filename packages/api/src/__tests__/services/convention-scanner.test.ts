import { describe, it, expect } from "vitest";
import { checkConventions } from "../../services/convention-scanner.js";
import type { ConventionRule } from "../../lib/config.js";

describe("checkConventions", () => {
  const makeRule = (overrides: Partial<ConventionRule> & { id: string; pattern: string; description: string }): ConventionRule => ({
    negativeContext: [],
    severity: "info",
    matchType: "must_not_match",
    ...overrides,
  });

  describe("must_not_match rules", () => {
    it("returns finding when pattern matches content", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "no-deprecated",
          pattern: "qwen3-8b",
          description: "Deprecated model reference",
        }),
      ];

      const findings = checkConventions("test-project", "Using qwen3-8b model", rules, []);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.projectSlug).toBe("test-project");
      expect(findings[0]!.checkType).toBe("convention_violation");
      expect(findings[0]!.detail).toContain("no-deprecated");
    });

    it("returns empty array when pattern does not match", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "no-deprecated",
          pattern: "qwen3-8b",
          description: "Deprecated model reference",
        }),
      ];

      const findings = checkConventions("test-project", "Using qwen3.5-35B model", rules, []);
      expect(findings).toHaveLength(0);
    });
  });

  describe("negativeContext", () => {
    it("suppresses finding when negative context pattern matches content", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "no-deprecated",
          pattern: "qwen3-8b",
          description: "Deprecated model reference",
          negativeContext: ["deprecated|replaced by|do not use"],
        }),
      ];

      const content = "qwen3-8b is fully deprecated. Do not use it.";
      const findings = checkConventions("test-project", content, rules, []);
      expect(findings).toHaveLength(0);
    });

    it("does not suppress when no negative context matches", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "no-deprecated",
          pattern: "qwen3-8b",
          description: "Deprecated model reference",
          negativeContext: ["this should not match anything"],
        }),
      ];

      const content = "Using qwen3-8b for training";
      const findings = checkConventions("test-project", content, rules, []);
      expect(findings).toHaveLength(1);
    });
  });

  describe("must_match rules", () => {
    it("returns finding when required pattern is ABSENT from content", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "has-overview",
          pattern: "## Overview|## Project Overview|## Architecture",
          description: "Missing overview section",
          matchType: "must_match",
        }),
      ];

      const findings = checkConventions("test-project", "# Project\n\nSome text", rules, []);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.detail).toContain("has-overview");
    });

    it("returns empty array when required pattern IS present", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "has-overview",
          pattern: "## Overview|## Project Overview|## Architecture",
          description: "Missing overview section",
          matchType: "must_match",
        }),
      ];

      const findings = checkConventions("test-project", "# Project\n\n## Architecture\n\nDetails...", rules, []);
      expect(findings).toHaveLength(0);
    });
  });

  describe("overrides", () => {
    it("skips rules listed in project overrides array", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "no-deprecated",
          pattern: "qwen3-8b",
          description: "Deprecated model reference",
          severity: "warning",
        }),
        makeRule({
          id: "has-overview",
          pattern: "## Overview",
          description: "Missing overview section",
          matchType: "must_match",
        }),
      ];

      // Override the no-deprecated rule
      const findings = checkConventions("test-project", "Using qwen3-8b", rules, ["no-deprecated"]);
      // Only has-overview should fire (content missing ## Overview)
      expect(findings).toHaveLength(1);
      expect(findings[0]!.detail).toContain("has-overview");
    });
  });

  describe("aggregation", () => {
    it("returns single HealthFindingInput with aggregated detail when multiple rules violated", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "no-deprecated",
          pattern: "qwen3-8b",
          description: "Deprecated model reference",
        }),
        makeRule({
          id: "no-todo",
          pattern: "\\bTODO\\b",
          description: "TODO marker found",
        }),
      ];

      const content = "Using qwen3-8b TODO fix later";
      const findings = checkConventions("test-project", content, rules, []);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.detail).toContain("no-deprecated");
      expect(findings[0]!.detail).toContain("no-todo");
      expect(findings[0]!.checkType).toBe("convention_violation");
    });
  });

  describe("severity", () => {
    it("uses worst severity across violated rules (critical > warning > info)", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "info-rule",
          pattern: "info-pattern",
          description: "Info rule",
          severity: "info",
        }),
        makeRule({
          id: "warning-rule",
          pattern: "warning-pattern",
          description: "Warning rule",
          severity: "warning",
        }),
        makeRule({
          id: "critical-rule",
          pattern: "critical-pattern",
          description: "Critical rule",
          severity: "critical",
        }),
      ];

      const content = "info-pattern warning-pattern critical-pattern";
      const findings = checkConventions("test-project", content, rules, []);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.severity).toBe("critical");
    });

    it("escalates to warning when only warning and info rules violated", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "info-rule",
          pattern: "info-pattern",
          description: "Info rule",
          severity: "info",
        }),
        makeRule({
          id: "warning-rule",
          pattern: "warning-pattern",
          description: "Warning rule",
          severity: "warning",
        }),
      ];

      const content = "info-pattern warning-pattern";
      const findings = checkConventions("test-project", content, rules, []);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.severity).toBe("warning");
    });
  });

  describe("invalid regex", () => {
    it("skips rule without crashing on invalid regex", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "bad-regex",
          pattern: "[invalid(regex",
          description: "Invalid regex rule",
        }),
        makeRule({
          id: "good-rule",
          pattern: "good-pattern",
          description: "Good rule",
        }),
      ];

      const content = "good-pattern is here";
      const findings = checkConventions("test-project", content, rules, []);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.detail).toContain("good-rule");
      expect(findings[0]!.detail).not.toContain("bad-regex");
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty rules", () => {
      const findings = checkConventions("test-project", "Some content", [], []);
      expect(findings).toHaveLength(0);
    });

    it("handles empty content gracefully", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "no-deprecated",
          pattern: "qwen3-8b",
          description: "Deprecated model reference",
        }),
        makeRule({
          id: "has-overview",
          pattern: "## Overview",
          description: "Missing overview section",
          matchType: "must_match",
        }),
      ];

      const findings = checkConventions("test-project", "", rules, []);
      // must_not_match won't fire on empty, but must_match WILL fire
      expect(findings).toHaveLength(1);
      expect(findings[0]!.detail).toContain("has-overview");
    });
  });

  describe("metadata", () => {
    it("includes violations array in metadata", () => {
      const rules: ConventionRule[] = [
        makeRule({
          id: "no-deprecated",
          pattern: "qwen3-8b",
          description: "Deprecated model reference",
          severity: "warning",
        }),
      ];

      const findings = checkConventions("test-project", "qwen3-8b", rules, []);
      expect(findings).toHaveLength(1);
      const metadata = findings[0]!.metadata as Record<string, unknown>;
      expect(metadata).toBeDefined();
      expect(Array.isArray(metadata["violations"])).toBe(true);
      const violations = metadata["violations"] as Array<{ ruleId: string; description: string }>;
      expect(violations).toHaveLength(1);
      expect(violations[0]!.ruleId).toBe("no-deprecated");
      expect(violations[0]!.description).toBe("Deprecated model reference");
    });
  });
});
