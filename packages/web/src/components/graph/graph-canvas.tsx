import { useState, useCallback, useRef } from "react";
import { useForceSimulation } from "../../hooks/use-force-simulation.js";
import { GraphNodeElement } from "./graph-node.js";
import { GraphEdgeElement } from "./graph-edge.js";
import type { GraphNode, GraphEdge } from "../../lib/graph-data.js";

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlightedSlugs: Set<string> | null;
  onNodeHover: (slug: string | null) => void;
  onNodeClick: (slug: string) => void;
  width: number;
  height: number;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

type PositionedNode = GraphNode & { x: number; y: number };

export function GraphCanvas({
  nodes,
  edges,
  highlightedSlugs,
  onNodeHover,
  onNodeClick,
  width,
  height,
}: GraphCanvasProps) {
  const { positions, simulationRef } = useForceSimulation(nodes, edges, width, height);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });

  const dragState = useRef<{
    type: "none" | "pan" | "node";
    startX: number;
    startY: number;
    node: PositionedNode | null;
    transformStart: { x: number; y: number };
  }>({ type: "none", startX: 0, startY: 0, node: null, transformStart: { x: 0, y: 0 } });

  // Build position lookup for edges
  const posMap = new Map<string, { x: number; y: number }>();
  for (const p of positions) {
    if (p.x !== undefined && p.y !== undefined) {
      posMap.set(p.id, { x: p.x, y: p.y });
    }
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.3, Math.min(3.0, prev.scale * delta)),
    }));
  }, []);

  const handleSvgMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only start panning on the SVG background (not on nodes)
      if ((e.target as SVGElement).tagName === "svg") {
        dragState.current = {
          type: "pan",
          startX: e.clientX,
          startY: e.clientY,
          node: null,
          transformStart: { x: transform.x, y: transform.y },
        };
      }
    },
    [transform.x, transform.y]
  );

  const handleNodeMouseDown = useCallback(
    (node: PositionedNode, e: React.MouseEvent) => {
      e.stopPropagation();
      onNodeClick(node.id);

      // Start drag: pin the node immediately
      const sim = simulationRef.current;
      if (sim) {
        const simNode = sim.nodes().find((n) => n.id === node.id);
        if (simNode) {
          simNode.fx = simNode.x;
          simNode.fy = simNode.y;
          sim.alphaTarget(0.3).restart();
        }
      }

      dragState.current = {
        type: "node",
        startX: e.clientX,
        startY: e.clientY,
        node,
        transformStart: { x: 0, y: 0 },
      };
    },
    [onNodeClick, simulationRef]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const state = dragState.current;
      if (state.type === "pan") {
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        setTransform((prev) => ({
          ...prev,
          x: state.transformStart.x + dx,
          y: state.transformStart.y + dy,
        }));
      } else if (state.type === "node" && state.node) {
        // Convert mouse to graph space (Pitfall 5)
        const svgRect = (e.currentTarget as SVGElement).getBoundingClientRect();
        const mouseX = e.clientX - svgRect.left;
        const mouseY = e.clientY - svgRect.top;
        const graphX = (mouseX - transform.x) / transform.scale;
        const graphY = (mouseY - transform.y) / transform.scale;

        const sim = simulationRef.current;
        if (sim) {
          const simNode = sim.nodes().find((n) => n.id === state.node!.id);
          if (simNode) {
            simNode.fx = graphX;
            simNode.fy = graphY;
          }
        }
      }
    },
    [transform.x, transform.y, transform.scale, simulationRef]
  );

  const handleMouseUp = useCallback(() => {
    const state = dragState.current;
    if (state.type === "node") {
      // Keep pinned (D-04): don't clear fx/fy
      const sim = simulationRef.current;
      if (sim) {
        sim.alphaTarget(0);
      }
    }
    dragState.current = { type: "none", startX: 0, startY: 0, node: null, transformStart: { x: 0, y: 0 } };
  }, [simulationRef]);

  const handleNodeHover = useCallback(
    (node: PositionedNode) => {
      onNodeHover(node.id);
    },
    [onNodeHover]
  );

  const handleNodeLeave = useCallback(() => {
    onNodeHover(null);
  }, [onNodeHover]);

  return (
    <svg
      width={width}
      height={height}
      className="select-none"
      style={{ cursor: dragState.current.type !== "none" ? "grabbing" : "default" }}
      onWheel={handleWheel}
      onMouseDown={handleSvgMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
        {/* Edges first (behind nodes) */}
        {edges.map((edge) => {
          const srcId = typeof edge.source === "string" ? edge.source : (edge.source as unknown as GraphNode).id;
          const tgtId = typeof edge.target === "string" ? edge.target : (edge.target as unknown as GraphNode).id;
          const src = posMap.get(srcId);
          const tgt = posMap.get(tgtId);
          if (!src || !tgt) return null;

          const isHighlighted =
            highlightedSlugs !== null && highlightedSlugs.has(srcId) && highlightedSlugs.has(tgtId);
          const isDimmed = highlightedSlugs !== null && !isHighlighted;

          return (
            <GraphEdgeElement
              key={`${srcId}-${tgtId}`}
              edgeId={`${srcId}-${tgtId}`}
              sourceX={src.x}
              sourceY={src.y}
              targetX={tgt.x}
              targetY={tgt.y}
              highlighted={isHighlighted}
              dimmed={isDimmed}
            />
          );
        })}

        {/* Nodes */}
        {positions.map((pos) => {
          if (pos.x === undefined || pos.y === undefined) return null;

          const isHighlighted = highlightedSlugs !== null && highlightedSlugs.has(pos.id);
          const isDimmed = highlightedSlugs !== null && !highlightedSlugs.has(pos.id);

          return (
            <GraphNodeElement
              key={pos.id}
              node={pos as PositionedNode}
              highlighted={isHighlighted}
              dimmed={isDimmed}
              onMouseEnter={handleNodeHover}
              onMouseLeave={handleNodeLeave}
              onMouseDown={handleNodeMouseDown}
            />
          );
        })}
      </g>
    </svg>
  );
}
