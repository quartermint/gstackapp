import type { ProjectItem } from "../../lib/grouping.js";
import { formatRelativeTime } from "../../lib/time.js";
import { HostBadge } from "../ui/host-badge.js";
import { DirtyIndicator } from "../ui/dirty-indicator.js";

interface ProjectRowProps {
  project: ProjectItem;
  isSelected: boolean;
  onSelect: (slug: string) => void;
  captureCount?: number;
}

export function ProjectRow({ project, isSelected, onSelect, captureCount }: ProjectRowProps) {
  return (
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
      className={`cursor-pointer rounded-lg px-3 py-2.5 transition-colors ${
        isSelected
          ? "bg-surface-warm dark:bg-surface-warm-dark border-l-2 border-terracotta"
          : "hover:bg-surface-warm/50 dark:hover:bg-surface-warm-dark/50 border-l-2 border-transparent"
      }`}
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
      </div>

      {/* Line 2: tagline (hidden on mobile) */}
      {project.tagline && (
        <p className="hidden sm:block text-sm text-text-secondary dark:text-text-secondary-dark truncate mt-0.5 min-w-0">
          {project.tagline}
        </p>
      )}
    </div>
  );
}
