import { describe, it, expect } from "vitest";
import {
  buildGraphData,
  getHighlightChain,
  type GraphNode,
  type GraphEdge,
} from "../../lib/graph-data.js";
import type { ProjectItem } from "../../lib/grouping.js";

/** Minimal project factory with dependency support. */
function makeProject(
  slug: string,
  overrides: Partial<ProjectItem> = {}
): ProjectItem {
  return {
    slug,
    name: overrides.name ?? slug,
    tagline: null,
    path: `/test/${slug}`,
    host: overrides.host ?? "local",
    branch: "main",
    dirty: false,
    dirtyFiles: [],
    lastCommitHash: "abc123",
    lastCommitMessage: "test commit",
    lastCommitTime: "2 days ago",
    lastCommitDate: new Date().toISOString(),
    lastScannedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    healthScore: null,
    riskLevel: overrides.riskLevel ?? "unmonitored",
    copyCount: 0,
    dependsOn: overrides.dependsOn ?? [],
  };
}

// ---------------------------------------------------------------------------
// buildGraphData
// ---------------------------------------------------------------------------
describe("buildGraphData", () => {
  it("returns empty nodes and edges for empty array", () => {
    const result = buildGraphData([]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("returns 3 nodes and 0 edges for projects with no dependencies", () => {
    const projects = [
      makeProject("alpha"),
      makeProject("bravo"),
      makeProject("charlie"),
    ];
    const result = buildGraphData(projects);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(0);
  });

  it("creates an edge when project A depends on project B", () => {
    const projects = [
      makeProject("a", { dependsOn: ["b"] }),
      makeProject("b"),
    ];
    const result = buildGraphData(projects);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toEqual({ source: "a", target: "b" });
  });

  it("omits edge for dangling reference (target slug not in project list)", () => {
    const projects = [
      makeProject("a", { dependsOn: ["z"] }),
      makeProject("b"),
    ];
    const result = buildGraphData(projects);
    expect(result.edges).toHaveLength(0);
  });

  it("maps node properties correctly", () => {
    const projects = [
      makeProject("mc", {
        name: "Mission Control",
        host: "mac-mini",
        riskLevel: "warning",
        dependsOn: ["dep1", "dep2", "dep3"],
      }),
    ];
    const result = buildGraphData(projects);
    const node = result.nodes[0]!;
    expect(node.id).toBe("mc");
    expect(node.name).toBe("Mission Control");
    expect(node.host).toBe("mac-mini");
    expect(node.riskLevel).toBe("warning");
    expect(node.dependencyCount).toBe(3);
  });

  it("counts ALL declared deps in dependencyCount (including dangling)", () => {
    const projects = [
      makeProject("a", { dependsOn: ["b", "nonexistent"] }),
      makeProject("b"),
    ];
    const result = buildGraphData(projects);
    const nodeA = result.nodes.find((n) => n.id === "a")!;
    expect(nodeA.dependencyCount).toBe(2);
  });

  it("handles multiple edges from one project", () => {
    const projects = [
      makeProject("a", { dependsOn: ["b", "c"] }),
      makeProject("b"),
      makeProject("c"),
    ];
    const result = buildGraphData(projects);
    expect(result.edges).toHaveLength(2);
    expect(result.edges).toContainEqual({ source: "a", target: "b" });
    expect(result.edges).toContainEqual({ source: "a", target: "c" });
  });
});

// ---------------------------------------------------------------------------
// getHighlightChain
// ---------------------------------------------------------------------------
describe("getHighlightChain", () => {
  it("returns Set with only the slug when no dependencies exist", () => {
    const projects = [makeProject("solo")];
    const chain = getHighlightChain("solo", projects);
    expect(chain).toEqual(new Set(["solo"]));
  });

  it("clicking A highlights {A, B} when A depends on B (upstream)", () => {
    const projects = [
      makeProject("a", { dependsOn: ["b"] }),
      makeProject("b"),
    ];
    const chain = getHighlightChain("a", projects);
    expect(chain).toEqual(new Set(["a", "b"]));
  });

  it("clicking B highlights {A, B} when A depends on B (downstream)", () => {
    const projects = [
      makeProject("a", { dependsOn: ["b"] }),
      makeProject("b"),
    ];
    const chain = getHighlightChain("b", projects);
    expect(chain).toEqual(new Set(["a", "b"]));
  });

  it("traverses full upstream chain A -> B -> C", () => {
    const projects = [
      makeProject("a", { dependsOn: ["b"] }),
      makeProject("b", { dependsOn: ["c"] }),
      makeProject("c"),
    ];
    const chain = getHighlightChain("a", projects);
    expect(chain).toEqual(new Set(["a", "b", "c"]));
  });

  it("traverses full downstream chain A -> B -> C (clicking C)", () => {
    const projects = [
      makeProject("a", { dependsOn: ["b"] }),
      makeProject("b", { dependsOn: ["c"] }),
      makeProject("c"),
    ];
    const chain = getHighlightChain("c", projects);
    expect(chain).toEqual(new Set(["a", "b", "c"]));
  });

  it("traverses diamond shape A->B, A->C, B->D, C->D", () => {
    const projects = [
      makeProject("a", { dependsOn: ["b", "c"] }),
      makeProject("b", { dependsOn: ["d"] }),
      makeProject("c", { dependsOn: ["d"] }),
      makeProject("d"),
    ];
    const chain = getHighlightChain("a", projects);
    expect(chain).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("handles cycles without infinite loop", () => {
    const projects = [
      makeProject("a", { dependsOn: ["b"] }),
      makeProject("b", { dependsOn: ["a"] }),
    ];
    const chain = getHighlightChain("a", projects);
    expect(chain).toEqual(new Set(["a", "b"]));
  });

  it("returns Set with only the slug when slug is not in project list", () => {
    const projects = [makeProject("a")];
    const chain = getHighlightChain("unknown", projects);
    expect(chain).toEqual(new Set(["unknown"]));
  });

  it("handles complex graph with multiple entry points", () => {
    const projects = [
      makeProject("lib", { dependsOn: [] }),
      makeProject("app1", { dependsOn: ["lib"] }),
      makeProject("app2", { dependsOn: ["lib"] }),
      makeProject("unrelated"),
    ];
    const chain = getHighlightChain("lib", projects);
    expect(chain).toEqual(new Set(["lib", "app1", "app2"]));
    expect(chain.has("unrelated")).toBe(false);
  });
});
