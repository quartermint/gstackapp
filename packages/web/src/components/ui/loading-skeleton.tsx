export function HeroSkeleton() {
  return (
    <div className="bg-surface-elevated dark:bg-surface-elevated-dark rounded-xl p-6 shadow-sm animate-pulse">
      {/* Name + tagline */}
      <div className="h-6 w-48 bg-surface-warm dark:bg-surface-warm-dark rounded mb-2" />
      <div className="h-4 w-64 bg-surface-warm dark:bg-surface-warm-dark rounded mb-4" />
      {/* Badges row */}
      <div className="flex gap-2 mb-4">
        <div className="h-5 w-16 bg-surface-warm dark:bg-surface-warm-dark rounded-full" />
        <div className="h-5 w-20 bg-surface-warm dark:bg-surface-warm-dark rounded" />
      </div>
      {/* Commit timeline */}
      <div className="space-y-3 border-l-2 border-surface-warm dark:border-surface-warm-dark pl-4 ml-1">
        <div className="h-4 w-full bg-surface-warm dark:bg-surface-warm-dark rounded" />
        <div className="h-4 w-3/4 bg-surface-warm dark:bg-surface-warm-dark rounded" />
        <div className="h-4 w-5/6 bg-surface-warm dark:bg-surface-warm-dark rounded" />
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Group header */}
      <div className="h-4 w-24 bg-surface-warm dark:bg-surface-warm-dark rounded mb-2" />
      {/* Rows */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 py-3 px-3 rounded"
        >
          <div className="h-5 w-32 bg-surface-warm dark:bg-surface-warm-dark rounded" />
          <div className="h-4 w-16 bg-surface-warm dark:bg-surface-warm-dark rounded-full" />
          <div className="flex-1" />
          <div className="h-4 w-20 bg-surface-warm dark:bg-surface-warm-dark rounded" />
        </div>
      ))}
    </div>
  );
}
