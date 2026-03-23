import type { GraphNode } from "../../lib/graph-data.js";

const HOST_BORDER_COLORS: Record<string, string> = {
  local: "#9c8b7e",
  "mac-mini": "#d4713a",
  github: "#6366f1",
};

const RISK_FILL_COLORS: Record<string, string> = {
  healthy: "#6b8f71",
  warning: "#c49b2a",
  critical: "#b7410e",
  unmonitored: "#9c8b7e",
};

interface GraphNodeElementProps {
  node: GraphNode & { x: number; y: number };
  highlighted: boolean;
  dimmed: boolean;
  onMouseEnter: (node: GraphNode & { x: number; y: number }) => void;
  onMouseLeave: () => void;
  onMouseDown: (node: GraphNode & { x: number; y: number }, e: React.MouseEvent) => void;
}

export function GraphNodeElement({
  node,
  highlighted,
  dimmed,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
}: GraphNodeElementProps) {
  const borderColor = HOST_BORDER_COLORS[node.host] ?? HOST_BORDER_COLORS.local;
  const riskColor = RISK_FILL_COLORS[node.riskLevel] ?? RISK_FILL_COLORS.unmonitored;
  const opacity = dimmed ? 0.2 : highlighted ? 1.0 : 0.8;
  const strokeWidth = highlighted ? 3 : 2;

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      style={{ opacity, cursor: "grab", transition: "opacity 0.2s ease" }}
      onMouseEnter={() => onMouseEnter(node)}
      onMouseLeave={onMouseLeave}
      onMouseDown={(e) => onMouseDown(node, e)}
    >
      {/* Main circle */}
      <circle
        r={20}
        fill="var(--color-surface-elevated, #ffffff)"
        stroke={borderColor}
        strokeWidth={strokeWidth}
      />
      {/* Health dot */}
      <circle
        cx={14}
        cy={-14}
        r={4}
        fill={riskColor}
      />
      {/* Label */}
      <text
        y={34}
        textAnchor="middle"
        fontSize={10}
        fill="currentColor"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {node.name}
      </text>
    </g>
  );
}
