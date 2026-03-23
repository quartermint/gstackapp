import type { GraphNode } from "../../lib/graph-data.js";

const RISK_LABEL_COLORS: Record<string, string> = {
  healthy: "#6b8f71",
  warning: "#c49b2a",
  critical: "#b7410e",
  unmonitored: "#9c8b7e",
};

interface GraphTooltipProps {
  node: GraphNode;
  x: number;
  y: number;
}

export function GraphTooltip({ node, x, y }: GraphTooltipProps) {
  const riskColor = RISK_LABEL_COLORS[node.riskLevel] ?? RISK_LABEL_COLORS.unmonitored;
  const riskLabel = node.riskLevel.charAt(0).toUpperCase() + node.riskLevel.slice(1);

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left: x + 16,
        top: y - 12,
      }}
    >
      <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-lg px-3 py-2 text-xs whitespace-nowrap">
        <div className="font-semibold text-sm">{node.name}</div>
        <div className="mt-0.5" style={{ color: riskColor }}>{riskLabel}</div>
        <div className="mt-0.5 text-gray-400">
          {node.dependencyCount} {node.dependencyCount === 1 ? "dependency" : "dependencies"}
        </div>
      </div>
    </div>
  );
}
