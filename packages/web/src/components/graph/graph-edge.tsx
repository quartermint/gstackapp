interface GraphEdgeElementProps {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  highlighted: boolean;
  dimmed: boolean;
  edgeId: string;
}

const NODE_RADIUS = 20;

export function GraphEdgeElement({
  sourceX,
  sourceY,
  targetX,
  targetY,
  highlighted,
  dimmed,
  edgeId,
}: GraphEdgeElementProps) {
  // Shorten the line by node radius at both ends so arrows don't overlap circles
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist === 0) return null;

  const ux = dx / dist;
  const uy = dy / dist;

  const x1 = sourceX + ux * NODE_RADIUS;
  const y1 = sourceY + uy * NODE_RADIUS;
  const x2 = targetX - ux * NODE_RADIUS;
  const y2 = targetY - uy * NODE_RADIUS;

  const opacity = dimmed ? 0.1 : highlighted ? 0.8 : 0.4;

  return (
    <>
      <defs>
        <marker
          id={`arrow-${edgeId}`}
          viewBox="0 0 10 6"
          refX="10"
          refY="3"
          markerWidth="8"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,3 L0,6 Z" fill="#9c8b7e" opacity={opacity > 0.3 ? 1 : 0.5} />
        </marker>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#9c8b7e"
        strokeWidth={1.5}
        opacity={opacity}
        markerEnd={`url(#arrow-${edgeId})`}
        style={{ transition: "opacity 0.2s ease" }}
      />
    </>
  );
}
