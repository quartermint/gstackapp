import { useState } from "react";
import type { DailyDigest } from "../../hooks/use-digest.js";

interface DailyDigestPanelProps {
  digest: DailyDigest | null;
  loading: boolean;
}

/**
 * Daily digest panel — morning intelligence briefing.
 *
 * Renders sections ordered by priority (high first), action items as
 * checklist-style bullets, and project highlights as a compact list.
 *
 * When digest is null: renders nothing (completely hidden).
 * When loading: subtle shimmer skeleton.
 */
export function DailyDigestPanel({ digest, loading }: DailyDigestPanelProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-warm-gray/12 dark:border-warm-gray/8 bg-surface-elevated dark:bg-surface-elevated-dark p-4">
        <div className="animate-pulse space-y-2.5">
          <div className="h-3.5 bg-warm-gray/10 dark:bg-warm-gray/6 rounded w-1/3" />
          <div className="h-3 bg-warm-gray/10 dark:bg-warm-gray/6 rounded w-3/4" />
          <div className="h-3 bg-warm-gray/10 dark:bg-warm-gray/6 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!digest) return null;

  const generatedTime = formatRelativeTime(digest.generatedAt);

  // Sort sections by priority: high > medium > low
  const sortedSections = [...digest.sections].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  return (
    <div className="rounded-xl border border-warm-gray/12 dark:border-warm-gray/8 bg-surface-elevated dark:bg-surface-elevated-dark p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-3.5 h-3.5 text-text-muted dark:text-text-muted-dark"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        <h3 className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark">
          Daily Digest
        </h3>
        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-terracotta/10 text-terracotta dark:bg-terracotta/15 dark:text-terracotta/80">
          AI
        </span>
        <span className="ml-auto text-[10px] text-text-muted dark:text-text-muted-dark">
          {generatedTime}
        </span>
      </div>

      {/* Summary */}
      <p className="text-sm font-medium text-text-primary dark:text-text-primary-dark leading-relaxed mb-3">
        {digest.summary}
      </p>

      {/* Sections */}
      {sortedSections.length > 0 && (
        <div className="space-y-2.5 mb-3">
          {sortedSections.map((section, i) =>
            section.priority === "low" ? (
              <CollapsibleSection key={i} section={section} />
            ) : (
              <DigestSection key={i} section={section} />
            )
          )}
        </div>
      )}

      {/* Action Items */}
      {digest.actionItems.length > 0 && (
        <div className="mb-3">
          <h4 className="text-[10px] uppercase font-semibold tracking-wider text-text-muted dark:text-text-muted-dark mb-1.5">
            Action Items
          </h4>
          <ul className="space-y-0.5">
            {digest.actionItems.map((item, i) => (
              <li
                key={i}
                className="text-[11px] text-text-secondary dark:text-text-secondary-dark flex items-start gap-1.5"
              >
                <span className="text-terracotta mt-0.5 shrink-0">
                  &#9679;
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Project Highlights */}
      {digest.projectHighlights.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase font-semibold tracking-wider text-text-muted dark:text-text-muted-dark mb-1.5">
            Projects
          </h4>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {digest.projectHighlights.map((ph) => (
              <span
                key={ph.slug}
                className="text-[11px] text-text-secondary dark:text-text-secondary-dark"
              >
                <span className="font-medium text-text-primary dark:text-text-primary-dark">
                  {ph.slug}
                </span>
                {" "}
                <span className="text-text-muted dark:text-text-muted-dark">
                  {ph.activity}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

interface SectionProps {
  section: {
    title: string;
    items: string[];
    priority: "high" | "medium" | "low";
  };
}

function DigestSection({ section }: SectionProps) {
  const borderClass =
    section.priority === "high"
      ? "border-l-amber-warm/60"
      : "border-l-warm-gray/20 dark:border-l-warm-gray/10";

  return (
    <div className={`border-l-2 ${borderClass} pl-2.5`}>
      <h4 className="text-[11px] font-semibold text-text-primary dark:text-text-primary-dark mb-0.5">
        {section.title}
      </h4>
      {section.items.length > 0 && (
        <ul className="space-y-0">
          {section.items.map((item, i) => (
            <li
              key={i}
              className="text-[11px] text-text-secondary dark:text-text-secondary-dark"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CollapsibleSection({ section }: SectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-l-2 border-l-warm-gray/10 dark:border-l-warm-gray/6 pl-2.5">
      <button
        type="button"
        className="text-[11px] font-semibold text-text-muted dark:text-text-muted-dark flex items-center gap-1 cursor-pointer hover:text-text-secondary dark:hover:text-text-secondary-dark transition-colors"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span
          className="inline-block transition-transform text-[8px]"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          &#9654;
        </span>
        {section.title}
        <span className="font-normal text-text-muted dark:text-text-muted-dark ml-1">
          ({section.items.length})
        </span>
      </button>
      {open && section.items.length > 0 && (
        <ul className="mt-0.5 space-y-0">
          {section.items.map((item, i) => (
            <li
              key={i}
              className="text-[11px] text-text-secondary dark:text-text-secondary-dark"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Utilities ────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMin / 60);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return date.toLocaleDateString();
  } catch {
    return "";
  }
}
