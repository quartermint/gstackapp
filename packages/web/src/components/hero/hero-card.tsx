import type { ProjectDetail } from "../../hooks/use-project-detail.js";
import type { CaptureItem } from "../../hooks/use-captures.js";
import type { ProjectItem } from "../../lib/grouping.js";
import { HostBadge } from "../ui/host-badge.js";
import { GsdBadge } from "../ui/gsd-badge.js";
import { DirtyIndicator } from "../ui/dirty-indicator.js";
import { HeroSkeleton } from "../ui/loading-skeleton.js";
import { CommitTimeline } from "./commit-timeline.js";
import { CaptureCard } from "../capture/capture-card.js";

interface HeroCardProps {
  detail: ProjectDetail | null;
  loading: boolean;
  captures?: CaptureItem[];
  projects?: ProjectItem[];
  onCapturesCorrected?: () => void;
}

export function HeroCard({ detail, loading, captures, projects, onCapturesCorrected }: HeroCardProps) {
  if (loading) return <HeroSkeleton />;
  if (!detail) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-warm-gray/12 dark:border-warm-gray/6 bg-surface-elevated dark:bg-surface-elevated-dark shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-4px_rgba(0,0,0,0.05)]">
      {/* Terracotta accent gradient bar */}
      <div className="h-[3px] bg-gradient-to-r from-terracotta via-amber-warm/70 to-transparent" />

      <div className="p-5 sm:p-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">
              {detail.name}
            </h2>
            <p className="text-sm text-text-secondary dark:text-text-secondary-dark mt-0.5 hidden sm:block truncate">
              {detail.tagline}
            </p>
          </div>
          <DirtyIndicator
            dirty={detail.dirty}
            fileCount={detail.dirtyFiles.length}
          />
        </div>

        {/* Metadata badges */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
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

        {/* Recent captures */}
        {captures && captures.length > 0 && projects && (
          <div className="mt-5 pt-4 border-t border-warm-gray/10 dark:border-warm-gray/6">
            <h4 className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark mb-2.5">
              Recent Captures
            </h4>
            <div className="space-y-1.5">
              {captures.slice(0, 3).map((capture) => (
                <CaptureCard
                  key={capture.id}
                  capture={capture}
                  projects={projects}
                  onCorrected={onCapturesCorrected}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
