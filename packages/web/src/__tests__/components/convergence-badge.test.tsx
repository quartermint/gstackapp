import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

describe("ConvergenceBadge", () => {
  let ConvergenceBadge: typeof import("../../components/departure-board/convergence-badge.js").ConvergenceBadge;

  beforeEach(async () => {
    const mod = await import("../../components/departure-board/convergence-badge.js");
    ConvergenceBadge = mod.ConvergenceBadge;
  });

  it("renders with session count and file count", () => {
    const { container } = render(
      <ConvergenceBadge sessionCount={3} fileCount={5} />
    );
    const badge = container.querySelector("span");
    expect(badge).toBeDefined();
    expect(badge!.textContent).toContain("3");
  });

  it("shows correct tooltip text", () => {
    render(<ConvergenceBadge sessionCount={2} fileCount={4} />);
    const badge = screen.getByTitle(
      "2 sessions may be ready to converge (4 shared files)"
    );
    expect(badge).toBeDefined();
  });

  it("has amber color classes", () => {
    const { container } = render(
      <ConvergenceBadge sessionCount={2} fileCount={3} />
    );
    const badge = container.querySelector("span");
    expect(badge!.className).toContain("bg-amber-500/12");
    expect(badge!.className).toContain("text-amber-500");
  });

  it("renders merge icon SVG", () => {
    const { container } = render(
      <ConvergenceBadge sessionCount={2} fileCount={1} />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();
    expect(svg!.classList.contains("w-2.5")).toBe(true);
  });
});

describe("getConvergenceForProject", () => {
  let getConvergenceForProject: typeof import("../../hooks/use-project-health.js").getConvergenceForProject;

  beforeEach(async () => {
    const mod = await import("../../hooks/use-project-health.js");
    getConvergenceForProject = mod.getConvergenceForProject;
  });

  it("returns session count and file count when convergence finding exists", () => {
    const findings = [
      {
        id: 1,
        projectSlug: "test-proj",
        checkType: "convergence",
        severity: "info",
        detail: "2 sessions converging",
        metadata: {
          sessions: [
            { id: "s1", status: "completed" },
            { id: "s2", status: "active" },
          ],
          overlappingFiles: ["/src/shared.ts", "/src/other.ts"],
          type: "convergence",
        },
        detectedAt: new Date().toISOString(),
        resolvedAt: null,
        isNew: false,
      },
    ];

    const result = getConvergenceForProject(findings, "test-proj");
    expect(result).toEqual({ sessionCount: 2, fileCount: 2 });
  });

  it("returns null when no convergence finding exists for the project", () => {
    const findings = [
      {
        id: 1,
        projectSlug: "other-proj",
        checkType: "convergence",
        severity: "info",
        detail: "2 sessions converging",
        metadata: {
          sessions: [{ id: "s1", status: "completed" }],
          overlappingFiles: ["/src/a.ts"],
          type: "convergence",
        },
        detectedAt: new Date().toISOString(),
        resolvedAt: null,
        isNew: false,
      },
    ];

    const result = getConvergenceForProject(findings, "test-proj");
    expect(result).toBeNull();
  });

  it("returns null when finding has no metadata", () => {
    const findings = [
      {
        id: 1,
        projectSlug: "test-proj",
        checkType: "convergence",
        severity: "info",
        detail: "test",
        metadata: null,
        detectedAt: new Date().toISOString(),
        resolvedAt: null,
        isNew: false,
      },
    ];

    const result = getConvergenceForProject(findings, "test-proj");
    expect(result).toBeNull();
  });

  it("returns null for empty findings array", () => {
    const result = getConvergenceForProject([], "test-proj");
    expect(result).toBeNull();
  });
});
