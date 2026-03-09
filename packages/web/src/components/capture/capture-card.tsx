import { useState } from "react";
import type { CaptureItem } from "../../hooks/use-captures.js";
import type { ProjectItem } from "../../lib/grouping.js";
import { formatRelativeTime } from "../../lib/time.js";
import { CaptureCorrection } from "./capture-correction.js";

interface CaptureCardProps {
  capture: CaptureItem;
  projects: ProjectItem[];
  onCorrected?: () => void;
}

/**
 * Single capture display with content preview, link card, relative time,
 * status indicator, and clickable project badge for correction.
 *
 * Designed to be compact and lightweight -- should not compete with
 * departure board information density.
 */
export function CaptureCard({ capture, projects, onCorrected }: CaptureCardProps) {
  const [correctionOpen, setCorrectionOpen] = useState(false);

  const assignedProject = capture.projectId
    ? projects.find((p) => p.slug === capture.projectId)
    : null;

  const isEnriching =
    capture.status === "raw" || capture.status === "pending_enrichment";

  return (
    <div className="py-2 px-3 rounded-lg bg-surface/50 dark:bg-surface-dark/50">
      {/* Content */}
      {capture.linkUrl && capture.linkTitle ? (
        <a
          href={capture.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-terracotta hover:underline truncate"
        >
          {capture.linkTitle}
          {capture.linkDomain && (
            <span className="text-[10px] text-text-muted dark:text-text-muted-dark ml-1.5 font-mono">
              {capture.linkDomain}
            </span>
          )}
        </a>
      ) : capture.linkUrl ? (
        <span className="block text-sm font-mono text-text-secondary dark:text-text-secondary-dark truncate">
          {capture.linkUrl}
        </span>
      ) : (
        <p className="text-sm text-text-primary dark:text-text-primary-dark line-clamp-2">
          {capture.rawContent}
        </p>
      )}

      {/* If there's a link but also raw content that differs, show the raw content too */}
      {capture.linkUrl && capture.rawContent !== capture.linkUrl && (
        <p className="text-xs text-text-secondary dark:text-text-secondary-dark line-clamp-1 mt-0.5">
          {capture.rawContent}
        </p>
      )}

      {/* Meta row: time + status + project badge */}
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[11px] text-text-muted dark:text-text-muted-dark">
          {formatRelativeTime(capture.createdAt)}
        </span>

        {/* Enrichment status indicator */}
        {isEnriching && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-terracotta/30 animate-pulse" />
        )}

        <span className="flex-1" />

        {/* Project badge -- click to open correction dropdown */}
        <div className="relative">
          <button
            onClick={() => setCorrectionOpen(!correctionOpen)}
            className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
              assignedProject
                ? "bg-terracotta/10 text-terracotta hover:bg-terracotta/20"
                : "bg-warm-gray/10 text-text-muted dark:text-text-muted-dark hover:bg-warm-gray/20"
            }`}
          >
            {assignedProject ? assignedProject.name : "Unlinked"}
          </button>

          {correctionOpen && (
            <CaptureCorrection
              captureId={capture.id}
              currentProjectId={capture.projectId}
              projects={projects}
              onCorrected={() => {
                setCorrectionOpen(false);
                onCorrected?.();
              }}
              onClose={() => setCorrectionOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
