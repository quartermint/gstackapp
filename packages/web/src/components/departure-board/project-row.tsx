import { useState } from "react";
import type { ProjectItem } from "../../lib/grouping.js";
import { formatRelativeTime } from "../../lib/time.js";
import { isStaleWithDirty, getStaleNudgeMessage } from "../../lib/stale-nudge.js";
import { HostBadge } from "../ui/host-badge.js";
import { DirtyIndicator } from "../ui/dirty-indicator.js";
import { PreviouslyOn } from "./previously-on.js";

interface ProjectRowProps {
  project: ProjectItem;
  isSelected: boolean;
  onSelect: (slug: string) => void;
  captureCount?: number;
  commits?: { hash: string; message: string; relativeTime: string }[];
  gsdState?: { status: string; stoppedAt: string | null; percent: number | null } | null;
}

export function ProjectRow({
  project,
  isSelected,
  onSelect,
  captureCount,
  commits,
  gsdState,
}: ProjectRowProps) {
  const [expanded, setExpanded] = useState(false);
  const stale = isStaleWithDirty(project);
  const hasHistory = commits && commits.length > 0;

  // Build border and background classes based on state
  const staleStyles = stale
    ? "border-amber-500/60 bg-amber-500/5"
    : "";

  const selectedStyles = isSelected
    ? "bg-surface-warm dark:bg-surface-warm-dark border-l-2 border-terracotta"
    : stale
      ? `hover:bg-surface-warm/50 dark:hover:bg-surface-warm-dark/50 border-l-2 ${staleStyles}`
      : "hover:bg-surface-warm/50 dark:hover:bg-surface-warm-dark/50 border-l-2 border-transparent";

  return (
    <div
      className={`cursor-pointer rounded-lg px-3 py-2.5 transition-colors ${selectedStyles}`}
      title={stale ? getStaleNudgeMessage(project) : undefined}
    >
      {/* Main row content (clickable for selection) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(project.slug)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(project.slug);
          }
        }}
      >
        {/* Line 1: name + metadata */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate min-w-0 shrink">
            {project.name}
          </span>
          <span className="hidden sm:inline">
            <HostBadge host={project.host} />
          </span>
          {project.branch && (
            <span className="hidden sm:inline text-xs font-mono text-text-muted dark:text-text-muted-dark truncate max-w-[120px]">
              {project.branch}
            </span>
          )}
          <span className="flex-1" />
          <span className="text-xs text-text-muted dark:text-text-muted-dark whitespace-nowrap shrink-0">
            {formatRelativeTime(project.lastCommitDate)}
          </span>
          <DirtyIndicator
            dirty={project.dirty}
            fileCount={project.dirtyFiles.length}
          />
          {captureCount != null && captureCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-terracotta/15 text-terracotta text-[10px] font-medium shrink-0">
              {captureCount}
            </span>
          )}

          {/* Expand chevron for "Previously on..." */}
          {hasHistory && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) => !prev);
              }}
              className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
              aria-label={expanded ? "Collapse history" : "Expand history"}
            >
              <svg
                className={`w-3.5 h-3.5 text-text-muted dark:text-text-muted-dark transition-transform duration-200 ${
                  expanded ? "rotate-90" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {/* Line 2: tagline (hidden on mobile) */}
        {project.tagline && (
          <p className="hidden sm:block text-sm text-text-secondary dark:text-text-secondary-dark truncate mt-0.5 min-w-0">
            {project.tagline}
          </p>
        )}
      </div>

      {/* Expandable "Previously on..." breadcrumbs */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          expanded && hasHistory ? "max-h-60 opacity-100 mt-1" : "max-h-0 opacity-0"
        }`}
      >
        {hasHistory && (
          <PreviouslyOn commits={commits} gsdState={gsdState ?? null} />
        )}
      </div>
    </div>
  );
}
