import { describe, it, expect } from "vitest";
import { SEVERITY_COLORS, severityIcon } from "../../lib/health-colors.js";
import { getActionCommand } from "../../lib/action-hints.js";

describe("SEVERITY_COLORS", () => {
  it("has entries for critical, warning, and healthy", () => {
    expect(SEVERITY_COLORS).toHaveProperty("critical");
    expect(SEVERITY_COLORS).toHaveProperty("warning");
    expect(SEVERITY_COLORS).toHaveProperty("healthy");
  });

  it("each severity has text, bg, border, dot, and icon class variants", () => {
    for (const severity of ["critical", "warning", "healthy"] as const) {
      const colors = SEVERITY_COLORS[severity];
      expect(colors).toHaveProperty("text");
      expect(colors).toHaveProperty("bg");
      expect(colors).toHaveProperty("border");
      expect(colors).toHaveProperty("dot");
      expect(colors).toHaveProperty("icon");
      expect(typeof colors.text).toBe("string");
      expect(typeof colors.bg).toBe("string");
      expect(typeof colors.border).toBe("string");
      expect(typeof colors.dot).toBe("string");
      expect(typeof colors.icon).toBe("string");
    }
  });

  it("critical uses rust color classes", () => {
    expect(SEVERITY_COLORS.critical.text).toContain("rust");
    expect(SEVERITY_COLORS.critical.bg).toContain("rust");
    expect(SEVERITY_COLORS.critical.border).toContain("rust");
  });

  it("warning uses gold-status color classes", () => {
    expect(SEVERITY_COLORS.warning.text).toContain("gold-status");
    expect(SEVERITY_COLORS.warning.bg).toContain("gold-status");
    expect(SEVERITY_COLORS.warning.border).toContain("gold-status");
  });

  it("healthy uses sage color classes", () => {
    expect(SEVERITY_COLORS.healthy.text).toContain("sage");
    expect(SEVERITY_COLORS.healthy.bg).toContain("sage");
    expect(SEVERITY_COLORS.healthy.border).toContain("sage");
  });
});

describe("severityIcon", () => {
  it("returns a React element for each severity", () => {
    for (const severity of ["critical", "warning", "healthy"] as const) {
      const icon = severityIcon(severity);
      expect(icon).toBeDefined();
      expect(icon).not.toBeNull();
    }
  });
});

describe("getActionCommand", () => {
  it("returns git push with branch from metadata for unpushed_commits", () => {
    const cmd = getActionCommand("unpushed_commits", { branch: "develop" });
    expect(cmd).toBe("git push origin develop");
  });

  it("defaults to main branch when metadata is null for unpushed_commits", () => {
    const cmd = getActionCommand("unpushed_commits", null);
    expect(cmd).toBe("git push origin main");
  });

  it("returns git remote add for no_remote", () => {
    const cmd = getActionCommand("no_remote", null);
    expect(cmd).toBe("git remote add origin <url>");
  });

  it("returns git branch -u for broken_tracking", () => {
    const cmd = getActionCommand("broken_tracking", { branch: "feat" });
    expect(cmd).toBe("git branch -u origin/feat");
  });

  it("defaults to main branch for broken_tracking without metadata", () => {
    const cmd = getActionCommand("broken_tracking", null);
    expect(cmd).toBe("git branch -u origin/main");
  });

  it("returns git checkout + push for remote_branch_gone", () => {
    const cmd = getActionCommand("remote_branch_gone", { branch: "feature-x" });
    expect(cmd).toBe("git checkout -b feature-x && git push -u origin feature-x");
  });

  it("returns git pull for unpulled_commits", () => {
    const cmd = getActionCommand("unpulled_commits", null);
    expect(cmd).toBe("git pull");
  });

  it("returns git stash for dirty_working_tree", () => {
    const cmd = getActionCommand("dirty_working_tree", null);
    expect(cmd).toBe("git stash");
  });

  it("returns git pull --rebase for diverged_copies", () => {
    const cmd = getActionCommand("diverged_copies", null);
    expect(cmd).toBe("git pull --rebase");
  });

  it("returns empty string for unknown check type", () => {
    const cmd = getActionCommand("unknown_type", null);
    expect(cmd).toBe("");
  });
});
