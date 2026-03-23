import { useState } from "react";
import type { CaptureItem } from "../../hooks/use-captures.js";
import type { ProjectItem } from "../../lib/grouping.js";
import { formatRelativeTime } from "../../lib/time.js";
import { CaptureCorrection } from "./capture-correction.js";
import { ExtractionBadges } from "./extraction-badges.js";
import type { Extraction } from "./extraction-badges.js";

// --- Grounded text highlight component ---

interface GroundedSpan {
  text: string;
  startOffset: number;
  endOffset: number;
  tier: "exact" | "fuzzy" | "lesser";
  extractionIndex: number;
}

function GroundedText({
  rawContent,
  groundingData,
}: {
  rawContent: string;
  groundingData: string | null | undefined;
}) {
  if (!groundingData) {
    return (
      <p className="text-sm text-text-primary dark:text-text-primary-dark line-clamp-2">
        {rawContent}
      </p>
    );
  }

  let spans: GroundedSpan[];
  try {
    spans = JSON.parse(groundingData) as GroundedSpan[];
  } catch {
    return (
      <p className="text-sm text-text-primary dark:text-text-primary-dark line-clamp-2">
        {rawContent}
      </p>
    );
  }

  if (spans.length === 0) {
    return (
      <p className="text-sm text-text-primary dark:text-text-primary-dark line-clamp-2">
        {rawContent}
      </p>
    );
  }

  // Sort spans by startOffset ascending
  const sorted = [...spans].sort((a, b) => a.startOffset - b.startOffset);

  // Build elements: plain text interspersed with highlighted marks
  const elements: React.ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < sorted.length; i++) {
    const span = sorted[i]!;

    // Skip overlapping or out-of-range spans
    if (span.startOffset < cursor || span.endOffset > rawContent.length) {
      continue;
    }

    // Plain text before the span
    if (span.startOffset > cursor) {
      elements.push(rawContent.slice(cursor, span.startOffset));
    }

    // Highlighted span
    const markClass =
      span.tier === "exact"
        ? "bg-terracotta/15 text-text-primary dark:text-text-primary-dark rounded px-0.5"
        : "bg-terracotta/8 text-text-primary dark:text-text-primary-dark rounded px-0.5 border-b border-dashed border-terracotta/30";

    elements.push(
      <mark key={`g-${i}`} className={markClass}>
        {rawContent.slice(span.startOffset, span.endOffset)}
      </mark>
    );

    cursor = span.endOffset;
  }

  // Remaining text after last span
  if (cursor < rawContent.length) {
    elements.push(rawContent.slice(cursor));
  }

  return (
    <p className="text-sm text-text-primary dark:text-text-primary-dark line-clamp-2">
      {elements}
    </p>
  );
}

// --- Capture card component ---

interface CaptureCardProps {
  capture: CaptureItem;
  projects: ProjectItem[];
  onCorrected?: () => void;
}

export function CaptureCard({ capture, projects, onCorrected }: CaptureCardProps) {
  const [correctionOpen, setCorrectionOpen] = useState(false);

  const assignedProject = capture.projectId
    ? projects.find((p) => p.slug === capture.projectId)
    : null;

  const isEnriching =
    capture.status === "raw" || capture.status === "pending_enrichment";

  // Map API extraction objects to the Extraction shape used by ExtractionBadges
  const extractions: Extraction[] = Array.isArray(capture.extractions)
    ? capture.extractions.map((e) => ({
        type: e.extractionType,
        text: e.content,
        confidence: e.confidence,
      }))
    : [];

  return (
    <div className="py-2 px-3 rounded-lg bg-surface/60 dark:bg-surface-dark/60 hover:bg-surface-warm/30 dark:hover:bg-surface-warm-dark/20 transition-colors">
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
        <GroundedText
          rawContent={capture.rawContent}
          groundingData={capture.groundingData}
        />
      )}

      {capture.linkUrl && capture.rawContent !== capture.linkUrl && (
        <p className="text-xs text-text-secondary dark:text-text-secondary-dark line-clamp-1 mt-0.5">
          {capture.rawContent}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[10px] font-mono text-text-muted dark:text-text-muted-dark tabular-nums">
          {formatRelativeTime(capture.createdAt)}
        </span>

        {extractions.length > 0 && (
          <ExtractionBadges extractions={extractions} />
        )}

        {isEnriching && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-terracotta/30 animate-pulse" />
        )}

        {capture.sourceType && capture.sourceType !== "manual" && (
          <span className="text-[9px] font-mono text-text-muted dark:text-text-muted-dark uppercase">
            {capture.sourceType}
          </span>
        )}

        <span className="flex-1" />

        <div className="relative">
          <button
            onClick={() => setCorrectionOpen(!correctionOpen)}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
              assignedProject
                ? "bg-terracotta/8 text-terracotta hover:bg-terracotta/15 border border-terracotta/10"
                : "bg-warm-gray/8 text-text-muted dark:text-text-muted-dark hover:bg-warm-gray/15 border border-warm-gray/10"
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
