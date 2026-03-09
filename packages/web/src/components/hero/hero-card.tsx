import type { ProjectDetail } from "../../hooks/use-project-detail.js";
import { HostBadge } from "../ui/host-badge.js";
import { GsdBadge } from "../ui/gsd-badge.js";
import { DirtyIndicator } from "../ui/dirty-indicator.js";
import { HeroSkeleton } from "../ui/loading-skeleton.js";
import { CommitTimeline } from "./commit-timeline.js";

interface HeroCardProps {
  detail: ProjectDetail | null;
  loading: boolean;
}

export function HeroCard({ detail, loading }: HeroCardProps) {
  if (loading) return <HeroSkeleton />;
  if (!detail) return null;

  return (
    <div className="bg-surface-elevated dark:bg-surface-elevated-dark rounded-xl p-5 sm:p-6 shadow-sm border border-surface-warm dark:border-surface-warm-dark">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <h2 className="text-xl font-bold truncate">{detail.name}</h2>
          <p className="text-sm text-text-secondary dark:text-text-secondary-dark mt-0.5 hidden sm:block truncate">
            {detail.tagline}
          </p>
        </div>
        <DirtyIndicator
          dirty={detail.dirty}
          fileCount={detail.dirtyFiles.length}
        />
      </div>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <HostBadge host={detail.host} />
        {detail.branch && (
          <span className="text-xs font-mono text-text-muted dark:text-text-muted-dark truncate max-w-[200px] hidden sm:inline">
            {detail.branch}
          </span>
        )}
        {detail.gsdState && <GsdBadge gsdState={detail.gsdState} />}
      </div>

      {/* Commit timeline */}
      <CommitTimeline commits={detail.commits} />
    </div>
  );
}
