import { useState } from "react";
import type { DiscoveryItem } from "../../hooks/use-discoveries.js";
import type { StarItem } from "../../hooks/use-stars.js";
import { DiscoveryPopover } from "./discovery-popover.js";
import { StarPopover } from "./star-popover.js";

interface WhatsNewStripProps {
  discoveries: DiscoveryItem[];
  stars: StarItem[];
  onPromote: (id: string) => void;
  onDismiss: (id: string) => void;
  onUpdateStarIntent: (githubId: number, intent: string) => void;
}

export function WhatsNewStrip({
  discoveries,
  stars,
  onPromote,
  onDismiss,
  onUpdateStarIntent,
}: WhatsNewStripProps) {
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [starOpen, setStarOpen] = useState(false);

  // Empty state: strip disappears when no discoveries and no stars
  if (discoveries.length === 0 && stars.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 border-b border-warm-gray/10 dark:border-warm-gray/5 py-2 overflow-visible">
      {/* Section label */}
      <span className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark">
        What&apos;s New
      </span>

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
    </div>
  );
}
