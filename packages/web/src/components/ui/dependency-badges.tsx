interface DependencyBadgesProps {
  dependsOn: string[];
}

const MAX_VISIBLE = 3;

export function DependencyBadges({ dependsOn }: DependencyBadgesProps) {
  if (dependsOn.length === 0) return null;

  const visible = dependsOn.slice(0, MAX_VISIBLE);
  const remaining = dependsOn.length - MAX_VISIBLE;

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {visible.map((dep) => (
        <span
          key={dep}
          className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-warm-gray/8 text-text-muted dark:text-text-muted-dark border border-warm-gray/10"
        >
          {dep}
        </span>
      ))}
      {remaining > 0 && (
        <span className="text-[10px] text-text-muted dark:text-text-muted-dark">
          +{remaining} more
        </span>
      )}
    </span>
  );
}
