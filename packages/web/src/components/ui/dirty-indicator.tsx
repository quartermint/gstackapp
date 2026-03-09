interface DirtyIndicatorProps {
  dirty: boolean | null;
  fileCount?: number;
}

export function DirtyIndicator({ dirty, fileCount }: DirtyIndicatorProps) {
  if (!dirty) return null;

  return (
    <span
      className="text-rust font-bold text-sm"
      title={
        fileCount !== undefined
          ? `${fileCount} uncommitted file${fileCount !== 1 ? "s" : ""}`
          : "Uncommitted changes"
      }
    >
      *
    </span>
  );
}
