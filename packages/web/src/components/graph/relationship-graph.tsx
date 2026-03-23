import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { buildGraphData, getHighlightChain } from "../../lib/graph-data.js";
import { GraphCanvas } from "./graph-canvas.js";
import { GraphTooltip } from "./graph-tooltip.js";
import type { GraphNode } from "../../lib/graph-data.js";
import type { ProjectItem } from "../../lib/grouping.js";

interface RelationshipGraphProps {
  projects: ProjectItem[];
}

export default function RelationshipGraph({ projects }: RelationshipGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<(GraphNode & { x: number; y: number }) | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Memoize graph data to avoid re-creating simulation (Pitfall 2)
  const { nodes, edges } = useMemo(() => buildGraphData(projects), [projects]);

  // Compute highlight chain when a node is selected (D-02)
  const highlightedSlugs = useMemo(() => {
    if (!selectedSlug) return null;
    return getHighlightChain(selectedSlug, projects);
  }, [selectedSlug, projects]);

  // Responsive sizing via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({ width, height: Math.max(500, width * 0.6) });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleNodeClick = useCallback((slug: string) => {
    setSelectedSlug((prev) => (prev === slug ? null : slug));
  }, []);

  const handleNodeHover = useCallback(
    (slug: string | null) => {
      if (slug === null) {
        setHoveredNode(null);
        return;
      }
      // We store the node reference for tooltip positioning via mouse events
      // but use slug to find the node from our data
      const node = nodes.find((n) => n.id === slug);
      if (node) {
        setHoveredNode(node as GraphNode & { x: number; y: number });
      }
    },
    [nodes]
  );

  const handleContainerMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  }, []);

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    // Clear selection on empty space click
    if ((e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement) === containerRef.current) {
      setSelectedSlug(null);
    }
  }, []);

  return (
    <div className="animate-fade-up">
      {/* Title bar */}
      <div className="mb-4">
        <h2 className="font-display italic text-2xl text-text-primary dark:text-text-primary-dark">
          Project Relationships
        </h2>
        <p className="text-sm text-text-muted dark:text-text-muted-dark mt-1">
          {nodes.length} projects, {edges.length} connections
        </p>
      </div>

      {/* Graph container */}
      <div
        ref={containerRef}
        className="relative rounded-2xl border border-warm-gray/10 dark:border-warm-gray/5 bg-surface-elevated dark:bg-surface-elevated-dark shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_-4px_rgba(0,0,0,0.03)] overflow-hidden"
        style={{ minHeight: 500 }}
        onMouseMove={handleContainerMouseMove}
        onClick={handleBackgroundClick}
      >
        {dimensions.width > 0 && (
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            highlightedSlugs={highlightedSlugs}
            onNodeHover={handleNodeHover}
            onNodeClick={handleNodeClick}
            width={dimensions.width}
            height={dimensions.height}
          />
        )}

        {/* Tooltip */}
        {hoveredNode && (
          <GraphTooltip
            node={hoveredNode}
            x={mousePos.x}
            y={mousePos.y}
          />
        )}
      </div>
    </div>
  );
}
