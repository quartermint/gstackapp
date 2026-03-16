import { useState } from "react";
import type { ProjectItem } from "../../lib/grouping.js";
import { formatRelativeTime } from "../../lib/time.js";
import { isStaleWithDirty, getStaleNudgeMessage } from "../../lib/stale-nudge.js";
import { HostBadge } from "../ui/host-badge.js";
import { DirtyIndicator } from "../ui/dirty-indicator.js";
import { PreviouslyOn } from "./previously-on.js";
import { HealthDot } from "./health-dot.js";
import { ConvergenceBadge } from "./convergence-badge.js";
import { FindingsPanel } from "./findings-panel.js";

interface ProjectRowProps {
  project: ProjectItem;
  isSelected: boolean;
  onSelect: (slug: string) => void;
  captureCount?: number;
  sessionCount?: number;
  commits?: { hash: string; message: string; relativeTime: string }[];
  gsdState?: { status: string; stoppedAt: string | null; percent: number | null } | null;
  riskLevel?: "healthy" | "warning" | "critical" | "unmonitored";
  hasDivergedCopies?: boolean;
  convergence?: { sessionCount: number; fileCount: number } | null;
}

export function ProjectRow({
  project,
  isSelected,
  onSelect,
  captureCount,
  sessionCount,
  commits,
  gsdState,
  riskLevel,
  hasDivergedCopies,
  convergence,
}: ProjectRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const stale = isStaleWithDirty(project);
  const hasHistory = commits && commits.length > 0;

  return (
    <div
      className={[
        "group cursor-pointer rounded-xl px-4 py-3 transition-all duration-200",
        isSelected
          ? "bg-surface-warm dark:bg-surface-warm-dark border-l-[3px] border-terracotta shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
          : stale
            ? "border-l-[3px] border-amber-500/40 bg-amber-500/[0.03] hover:bg-surface-warm/50 dark:hover:bg-surface-warm-dark/40"
            : "border-l-[3px] border-transparent hover:bg-surface-warm/40 dark:hover:bg-surface-warm-dark/30",
      ].join(" ")}
      title={stale ? getStaleNudgeMessage(project) : undefined}
    >
      {/* Main row */}
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
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`font-medium truncate min-w-0 shrink ${isSelected ? "text-text-primary dark:text-text-primary-dark" : ""}`}>
            {project.name}
          </span>
          <span className="hidden sm:inline">
            <HostBadge host={project.host} />
          </span>
          {project.branch && (
            <span className="hidden sm:inline text-[11px] font-mono text-text-muted dark:text-text-muted-dark truncate max-w-[120px]">
              {project.branch}
            </span>
          )}
          <span className="flex-1" />
          <span className="text-[11px] font-mono text-text-muted dark:text-text-muted-dark whitespace-nowrap shrink-0 tabular-nums">
            {formatRelativeTime(project.lastCommitDate)}
          </span>
          <DirtyIndicator
            dirty={project.dirty}
            fileCount={project.dirtyFiles.length}
          />
          {riskLevel && riskLevel !== "unmonitored" && (
            <HealthDot
              riskLevel={riskLevel}
              hasDivergedCopies={hasDivergedCopies ?? false}
              onClick={() => setHealthExpanded((prev) => !prev)}
            />
          )}
          {convergence && (
            <ConvergenceBadge
              sessionCount={convergence.sessionCount}
              fileCount={convergence.fileCount}
            />
          )}
          {sessionCount != null && sessionCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 h-[18px] min-w-[18px] px-1.5 rounded-full bg-blue-500/12 text-blue-400 text-[10px] font-semibold shrink-0"
              title={`${sessionCount} active session${sessionCount > 1 ? "s" : ""}`}
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3" />
              </svg>
              {sessionCount}
            </span>
          )}
          {captureCount != null && captureCount > 0 && (
            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-full bg-terracotta/12 text-terracotta text-[10px] font-semibold shrink-0">
              {captureCount}
            </span>
          )}

          {/* Expand chevron */}
          {hasHistory && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) => !prev);
              }}
              className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
              aria-label={expanded ? "Collapse history" : "Expand history"}
            >
              <svg
                className={`w-3 h-3 text-text-muted dark:text-text-muted-dark transition-transform duration-200 ${
                  expanded ? "rotate-90" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {/* Tagline */}
        {project.tagline && (
          <p className="hidden sm:block text-[13px] text-text-muted dark:text-text-muted-dark truncate mt-0.5 min-w-0">
            {project.tagline}
          </p>
        )}
      </div>

      {/* Expandable history */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          expanded && hasHistory ? "max-h-60 opacity-100 mt-2" : "max-h-0 opacity-0"
        }`}
      >
        {hasHistory && (
          <PreviouslyOn commits={commits} gsdState={gsdState ?? null} />
        )}
      </div>

      {/* Expandable findings panel */}
      <FindingsPanel slug={project.slug} expanded={healthExpanded} />
    </div>
  );
}
