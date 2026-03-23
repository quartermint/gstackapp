export function HeroSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-warm-gray/10 dark:border-warm-gray/5 bg-surface-elevated dark:bg-surface-elevated-dark shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_-4px_rgba(0,0,0,0.03)]">
      <div className="h-0.5 bg-gradient-to-r from-warm-gray/20 via-warm-gray/10 to-transparent" />
      <div className="p-6 animate-pulse">
        <div className="h-7 w-52 bg-surface-warm dark:bg-surface-warm-dark rounded-lg mb-2" />
        <div className="h-4 w-72 bg-surface-warm dark:bg-surface-warm-dark rounded mb-5" />
        <div className="flex gap-2 mb-5">
          <div className="h-5 w-18 bg-surface-warm dark:bg-surface-warm-dark rounded-full" />
          <div className="h-5 w-22 bg-surface-warm dark:bg-surface-warm-dark rounded" />
        </div>
        <div className="space-y-3 border-l-2 border-warm-gray/10 pl-4 ml-1">
          <div className="h-4 w-full bg-surface-warm dark:bg-surface-warm-dark rounded" />
          <div className="h-4 w-3/4 bg-surface-warm dark:bg-surface-warm-dark rounded" />
          <div className="h-4 w-5/6 bg-surface-warm dark:bg-surface-warm-dark rounded" />
        </div>
      </div>
    </div>
  );
}

export function GraphSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-52 bg-surface-warm dark:bg-surface-warm-dark rounded-lg mb-2" />
      <div className="h-4 w-40 bg-surface-warm dark:bg-surface-warm-dark rounded mb-4" />
      <div className="relative rounded-2xl border border-warm-gray/10 dark:border-warm-gray/5 bg-surface-elevated dark:bg-surface-elevated-dark shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_-4px_rgba(0,0,0,0.03)] overflow-hidden flex items-center justify-center" style={{ minHeight: 500 }}>
        {/* Central pulsing circle */}
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-surface-warm dark:bg-surface-warm-dark" />
          {/* Radiating lines */}
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <div
              key={angle}
              className="absolute bg-surface-warm dark:bg-surface-warm-dark"
              style={{
                width: 80,
                height: 2,
                left: "50%",
                top: "50%",
                transformOrigin: "0 50%",
                transform: `rotate(${angle}deg) translateX(40px)`,
              }}
            />
          ))}
          {/* Satellite circles */}
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <div
              key={`circle-${angle}`}
              className="absolute w-8 h-8 rounded-full bg-surface-warm dark:bg-surface-warm-dark"
              style={{
                left: `calc(50% + ${Math.cos((angle * Math.PI) / 180) * 120 - 16}px)`,
                top: `calc(50% + ${Math.sin((angle * Math.PI) / 180) * 120 - 16}px)`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Section divider skeleton */}
      <div className="flex items-center gap-4 mb-4">
        <div className="h-px flex-1 bg-warm-gray/10" />
        <div className="h-3 w-20 bg-surface-warm dark:bg-surface-warm-dark rounded" />
        <div className="h-px flex-1 bg-warm-gray/10" />
      </div>
      {/* Row skeletons */}
      <div className="space-y-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-3.5 px-4 rounded-lg"
          >
            <div className="h-5 w-36 bg-surface-warm dark:bg-surface-warm-dark rounded" />
            <div className="h-4 w-16 bg-surface-warm dark:bg-surface-warm-dark rounded-full" />
            <div className="flex-1" />
            <div className="h-4 w-16 bg-surface-warm dark:bg-surface-warm-dark rounded font-mono" />
          </div>
        ))}
      </div>
    </div>
  );
}
