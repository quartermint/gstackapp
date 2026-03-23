import { useState } from "react";
import type { DiscoveryItem } from "../../hooks/use-discoveries.js";
import type { StarItem } from "../../hooks/use-stars.js";
import type { DailyDigest } from "../../hooks/use-digest.js";
import type { Insight } from "../../hooks/use-insights.js";
import { DiscoveryPopover } from "./discovery-popover.js";
import { StarPopover } from "./star-popover.js";
import { DigestStripView } from "./digest-strip-view.js";
import { InsightBadges } from "./insight-badges.js";

interface WhatsNewStripProps {
  discoveries: DiscoveryItem[];
  stars: StarItem[];
  onPromote: (id: string) => void;
  onDismiss: (id: string) => void;
  onUpdateStarIntent: (githubId: number, intent: string) => void;
  changedCount?: number;
  /** Morning digest from intelligence cache (D-01). */
  digest?: DailyDigest | null;
  /** Whether digest is still loading. */
  digestLoading?: boolean;
  /** Active insights from the proactive intelligence engine. */
  insights?: Insight[];
  /** Called when user reads the digest ("Got it"). */
  onDigestRead?: () => void;
  /** Called to dismiss an insight. */
  onInsightDismiss?: (id: string) => void;
  /** Called to snooze an insight. */
  onInsightSnooze?: (id: string) => void;
  /** Called to open the full TriageView (bridges from stale capture insight to triage). */
  onOpenTriage?: () => void;
  /** Number of stale captures for triage display. */
  staleCount?: number;
}

/**
 * Intelligence strip — evolved from What's New (D-01).
 *
 * Morning view: shows AI-generated digest inline. After reading
 * ("Got it"), fades to regular What's New content (discoveries, stars,
 * changed projects). Insight badges appear alongside both views.
 *
 * Same position, same real estate, smarter content.
 */
export function WhatsNewStrip({
  discoveries,
  stars,
  onPromote,
  onDismiss,
  onUpdateStarIntent,
  changedCount,
  digest,
  digestLoading,
  insights,
  onDigestRead,
  onInsightDismiss,
  onInsightSnooze,
  onOpenTriage,
  staleCount,
}: WhatsNewStripProps) {
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [starOpen, setStarOpen] = useState(false);
  const [digestRead, setDigestRead] = useState(false);

  const hasDigest = !!digest && !digestRead;
  const hasInsights = insights && insights.length > 0;
  const hasWhatsNew = discoveries.length > 0 || stars.length > 0 || (changedCount != null && changedCount > 0);

  // Empty state: strip disappears when nothing to show
  if (!hasDigest && !hasInsights && !hasWhatsNew && !digestLoading) {
    return null;
  }

  const handleDigestRead = () => {
    setDigestRead(true);
    onDigestRead?.();
  };

  // Show digest view when morning digest is available and unread
  if (hasDigest && digest) {
    return (
      <div className="border-b border-warm-gray/10 dark:border-warm-gray/5 py-2 overflow-visible">
        {/* Intelligence label + AI pill */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark">
            Intelligence
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-terracotta/10 text-terracotta dark:bg-terracotta/15 dark:text-terracotta/80">
            AI
          </span>

          {/* Insight badges inline with digest view */}
          {hasInsights && onInsightDismiss && onInsightSnooze && (
            <InsightBadges
              insights={insights}
              onDismiss={onInsightDismiss}
              onSnooze={onInsightSnooze}
              onOpenTriage={onOpenTriage}
              staleCount={staleCount}
            />
          )}
        </div>

        <DigestStripView digest={digest} onRead={handleDigestRead} />
      </div>
    );
  }

  // Standard What's New view (post-digest or no digest)
  return (
    <div className="flex items-center gap-3 border-b border-warm-gray/10 dark:border-warm-gray/5 py-2 overflow-visible flex-wrap">
      {/* Section label */}
      <span className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark">
        What&apos;s New
      </span>

      {/* Insight badges */}
      {hasInsights && onInsightDismiss && onInsightSnooze && (
        <InsightBadges
          insights={insights}
          onDismiss={onInsightDismiss}
          onSnooze={onInsightSnooze}
          onOpenTriage={onOpenTriage}
          staleCount={staleCount}
        />
      )}

      {/* Discovery badge */}
      {discoveries.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setDiscoveryOpen((prev) => !prev);
              setStarOpen(false);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-terracotta/10 text-terracotta hover:bg-terracotta/18 transition-colors cursor-pointer text-[10px] font-semibold"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
              />
            </svg>
            {discoveries.length} discovered
          </button>
          <DiscoveryPopover
            discoveries={discoveries}
            open={discoveryOpen}
            onClose={() => setDiscoveryOpen(false)}
            onPromote={onPromote}
            onDismiss={onDismiss}
          />
        </div>
      )}

      {/* Star badge */}
      {stars.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setStarOpen((prev) => !prev);
              setDiscoveryOpen(false);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold-status/10 text-gold-status hover:bg-gold-status/18 transition-colors cursor-pointer text-[10px] font-semibold"
          >
            <svg
              className="w-3 h-3"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {stars.length} stars
          </button>
          <StarPopover
            stars={stars}
            open={starOpen}
            onClose={() => setStarOpen(false)}
            onUpdateIntent={onUpdateStarIntent}
          />
        </div>
      )}

      {/* Changed projects badge */}
      {changedCount != null && changedCount > 0 && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-semibold">
          {changedCount} changed
        </span>
      )}
    </div>
  );
}
