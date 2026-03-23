import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ProjectItem } from "../../lib/grouping.js";

// Mock ResizeObserver (not available in jsdom)
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    // Immediately fire with a mock entry for a 800x500 container
    this.callback(
      [{ contentRect: { width: 800, height: 500 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", MockResizeObserver);

function makeProject(overrides: Partial<ProjectItem> & Pick<ProjectItem, "slug" | "name">): ProjectItem {
  return {
    tagline: null,
    path: `/projects/${overrides.slug}`,
    host: "local",
    branch: "main",
    dirty: false,
    dirtyFiles: [],
    lastCommitHash: "abc123",
    lastCommitMessage: "init",
    lastCommitTime: "2026-03-20T00:00:00Z",
    lastCommitDate: "2026-03-20T00:00:00Z",
    lastScannedAt: "2026-03-20T00:00:00Z",
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-20T00:00:00Z",
    healthScore: 90,
    riskLevel: "healthy",
    copyCount: 1,
    dependsOn: [],
    ...overrides,
  };
}

describe("RelationshipGraph", () => {
  let RelationshipGraph: { default: React.ComponentType<{ projects: ProjectItem[] }> };

  beforeEach(async () => {
    RelationshipGraph = await import("../../components/graph/relationship-graph.js");
  });

  it("renders without crashing with empty projects array", () => {
    const Component = RelationshipGraph.default;
    const { container } = render(<Component projects={[]} />);
    expect(container.querySelector("svg") || container.textContent).toBeDefined();
  });

  it("renders an SVG element with mock projects", () => {
    const Component = RelationshipGraph.default;
    const mockProjects: ProjectItem[] = [
      makeProject({
        slug: "alpha",
        name: "Alpha",
        host: "local",
        riskLevel: "healthy",
        dependsOn: ["beta"],
      }),
      makeProject({
        slug: "beta",
        name: "Beta",
        host: "mac-mini",
        riskLevel: "warning",
      }),
    ];
    const { container } = render(<Component projects={mockProjects} />);
    expect(container.querySelector("svg")).toBeDefined();
  });

  it("has a default export", () => {
    expect(RelationshipGraph.default).toBeDefined();
    expect(typeof RelationshipGraph.default).toBe("function");
  });
});
