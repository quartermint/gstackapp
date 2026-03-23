import { useState, useEffect, useRef, useCallback } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force";
import type { Simulation } from "d3-force";
import type { GraphNode, GraphEdge } from "../lib/graph-data.js";

// Simulation parameters tuned for ~25 nodes in ~800x500 viewport
const CHARGE_STRENGTH = -200;
const LINK_DISTANCE = 120;
const COLLIDE_RADIUS = 45;
const CENTER_STRENGTH = 0.05;
const ALPHA_DECAY = 0.02;
const VELOCITY_DECAY = 0.4;

interface ForceSimulationResult {
  positions: GraphNode[];
  simulationRef: React.RefObject<Simulation<GraphNode, GraphEdge> | null>;
}

export function useForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
): ForceSimulationResult {
  const [positions, setPositions] = useState<GraphNode[]>([]);
  const simulationRef = useRef<Simulation<GraphNode, GraphEdge> | null>(null);
  const rafRef = useRef<number>(0);

  // Throttle position updates with requestAnimationFrame
  const scheduleUpdate = useCallback((sim: Simulation<GraphNode, GraphEdge>) => {
    if (rafRef.current) return; // Already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setPositions([...sim.nodes()]);
    });
  }, []);

  useEffect(() => {
    if (width === 0 || height === 0 || nodes.length === 0) {
      setPositions([]);
      return;
    }

    // Clone nodes to avoid mutating input (Pitfall 1)
    const clonedNodes = nodes.map((n) => ({ ...n }));
    const clonedEdges = edges.map((e) => ({ ...e }));

    const sim = forceSimulation<GraphNode>(clonedNodes)
      .force(
        "link",
        forceLink<GraphNode, GraphEdge>(clonedEdges)
          .id((d) => d.id) // Pitfall 3: use slug-based IDs, not indices
          .distance(LINK_DISTANCE)
      )
      .force("charge", forceManyBody().strength(CHARGE_STRENGTH))
      .force(
        "center",
        forceCenter(width / 2, height / 2).strength(CENTER_STRENGTH)
      )
      .force("collide", forceCollide(COLLIDE_RADIUS))
      .alphaDecay(ALPHA_DECAY)
      .velocityDecay(VELOCITY_DECAY)
      .on("tick", () => {
        scheduleUpdate(sim);
      });

    simulationRef.current = sim;

    // Initial positions
    setPositions([...clonedNodes]);

    return () => {
      sim.stop();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [nodes, edges, width, height, scheduleUpdate]);

  return { positions, simulationRef };
}
