import type { ProjectItem } from "./grouping.js";

// ---------------------------------------------------------------------------
// Types — structurally compatible with d3-force SimulationNodeDatum
// (no d3-force import to keep this module in the main bundle)
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  name: string;
  host: ProjectItem["host"];
  riskLevel: ProjectItem["riskLevel"];
  dependencyCount: number;
  // d3-force compatible (optional mutable props)
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
  index?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// buildGraphData
// ---------------------------------------------------------------------------

/**
 * Convert a flat ProjectItem array into graph nodes and edges.
 *
 * - Each project becomes a GraphNode.
 * - Each entry in `dependsOn` that references an existing project slug
 *   becomes a GraphEdge. Dangling references (slug not in projects) are
 *   filtered out.
 * - `dependencyCount` counts ALL declared deps (including dangling).
 */
export function buildGraphData(projects: ProjectItem[]): GraphData {
  const slugSet = new Set(projects.map((p) => p.slug));

  const nodes: GraphNode[] = projects.map((p) => ({
    id: p.slug,
    name: p.name,
    host: p.host,
    riskLevel: p.riskLevel,
    dependencyCount: p.dependsOn.length,
  }));

  const edges: GraphEdge[] = [];
  for (const p of projects) {
    for (const dep of p.dependsOn) {
      if (slugSet.has(dep)) {
        edges.push({ source: p.slug, target: dep });
      }
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// getHighlightChain
// ---------------------------------------------------------------------------

/**
 * Compute the full transitive closure (upstream + downstream) for a given
 * slug. Returns a Set of all slugs that are reachable in either direction.
 *
 * - Upstream: follow `dependsOn` links from the clicked slug outward.
 * - Downstream: follow reverse links (projects that depend on the slug).
 * - Cycle-safe via visited set.
 */
export function getHighlightChain(
  slug: string,
  projects: ProjectItem[]
): Set<string> {
  // Build adjacency maps once
  const upstream = new Map<string, string[]>(); // slug -> its dependencies
  const downstream = new Map<string, string[]>(); // slug -> slugs that depend on it

  const slugSet = new Set(projects.map((p) => p.slug));

  for (const p of projects) {
    upstream.set(p.slug, p.dependsOn.filter((d) => slugSet.has(d)));
    for (const dep of p.dependsOn) {
      if (slugSet.has(dep)) {
        const existing = downstream.get(dep) ?? [];
        existing.push(p.slug);
        downstream.set(dep, existing);
      }
    }
  }

  // BFS in both directions from the starting slug
  const visited = new Set<string>([slug]);
  const queue: string[] = [slug];

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Upstream neighbors (what current depends on)
    for (const neighbor of upstream.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    // Downstream neighbors (what depends on current)
    for (const neighbor of downstream.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return visited;
}
