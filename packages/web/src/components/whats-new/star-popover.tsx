import { useState, useEffect, useRef, useMemo } from "react";
import type { StarItem } from "../../hooks/use-stars.js";

interface StarPopoverProps {
  stars: StarItem[];
  open: boolean;
  onClose: () => void;
  onUpdateIntent: (githubId: number, intent: string) => void;
}

const INTENTS = ["reference", "tool", "try", "inspiration"] as const;
type Intent = (typeof INTENTS)[number];

const INTENT_COLORS: Record<Intent, string> = {
  reference: "bg-sage/12 text-sage",
  tool: "bg-terracotta/12 text-terracotta",
  try: "bg-blue-500/12 text-blue-500",
  inspiration: "bg-gold-status/12 text-gold-status",
};

const INTENT_ACTIVE_COLORS: Record<Intent, string> = {
  reference: "bg-sage/25 text-sage ring-1 ring-sage/30",
  tool: "bg-terracotta/25 text-terracotta ring-1 ring-terracotta/30",
  try: "bg-blue-500/25 text-blue-500 ring-1 ring-blue-500/30",
  inspiration: "bg-gold-status/25 text-gold-status ring-1 ring-gold-status/30",
};

function getNextIntent(current: string | null): Intent {
  if (!current) return INTENTS[0];
  const idx = INTENTS.indexOf(current as Intent);
  if (idx === -1) return INTENTS[0];
  return INTENTS[(idx + 1) % INTENTS.length] as Intent;
}

export function StarPopover({
  stars,
  open,
  onClose,
  onUpdateIntent,
}: StarPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [intentFilter, setIntentFilter] = useState<Intent | "all">("all");

  // Close on click outside (matches sessions-indicator.tsx pattern exactly)
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Reset search/filter when popover closes
  useEffect(() => {
    if (!open) {
      setSearch("");
      setIntentFilter("all");
    }
  }, [open]);

  // Filter stars by search + intent
  const filteredStars = useMemo(() => {
    let result = stars;

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.fullName.toLowerCase().includes(lower) ||
          (s.description?.toLowerCase().includes(lower) ?? false)
      );
    }

    if (intentFilter !== "all") {
      result = result.filter((s) => s.intent === intentFilter);
    }

    return result;
  }, [stars, search, intentFilter]);

  // Group by intent (only when no filter active)
  const grouped = useMemo(() => {
    if (intentFilter !== "all") return null;

    const groups: Record<string, StarItem[]> = {};
    for (const s of filteredStars) {
      const key = s.intent ?? "uncategorized";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    return groups;
  }, [filteredStars, intentFilter]);

  if (!open) return null;

  function renderStarItem(star: StarItem) {
    const intentKey = star.intent as Intent | null;

    return (
      <div
        key={star.githubId}
        className="flex items-start justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-warm/40 dark:hover:bg-surface-warm-dark/30 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <a
              href={star.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-text-primary dark:text-text-primary-dark hover:text-terracotta truncate"
            >
              {star.fullName}
            </a>
            {star.language && (
              <span className="text-[9px] font-medium rounded-full px-1.5 py-0.5 bg-warm-gray/8 text-text-muted dark:text-text-muted-dark shrink-0">
                {star.language}
              </span>
            )}
          </div>
          {star.description && (
            <p className="text-[10px] text-text-muted dark:text-text-muted-dark truncate mt-0.5">
              {star.description}
            </p>
          )}
        </div>

        {/* Intent badge (clickable to cycle) */}
        <button
          type="button"
          onClick={() => onUpdateIntent(star.githubId, getNextIntent(star.intent))}
          className={`text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 cursor-pointer transition-colors ${
            intentKey && INTENT_COLORS[intentKey]
              ? INTENT_COLORS[intentKey]
              : "bg-warm-gray/8 text-text-muted dark:text-text-muted-dark"
          }`}
          title={`Click to change intent (current: ${star.intent ?? "none"})`}
        >
          {star.intent ?? "---"}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="absolute top-full left-0 mt-1 w-[28rem] bg-surface dark:bg-surface-dark border border-black/10 dark:border-white/10 rounded-lg shadow-lg p-3 z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted-dark">
          GitHub Stars
        </h4>
        <span className="text-[10px] text-text-muted dark:text-text-muted-dark">
          {stars.length} total
        </span>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search stars..."
        className="w-full text-xs px-2 py-1.5 rounded-md border border-warm-gray/15 dark:border-warm-gray/10 bg-surface-elevated dark:bg-surface-elevated-dark text-text-primary dark:text-text-primary-dark placeholder:text-text-muted dark:placeholder:text-text-muted-dark focus:outline-none focus:ring-1 focus:ring-terracotta/30 mb-2"
      />

      {/* Intent filter tabs */}
      <div className="flex items-center gap-1 mb-2">
        <button
          type="button"
          onClick={() => setIntentFilter("all")}
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
            intentFilter === "all"
              ? "bg-warm-gray/20 text-text-primary dark:text-text-primary-dark ring-1 ring-warm-gray/20"
              : "bg-warm-gray/8 text-text-muted dark:text-text-muted-dark hover:bg-warm-gray/12"
          }`}
        >
          all
        </button>
        {INTENTS.map((intent) => (
          <button
            key={intent}
            type="button"
            onClick={() =>
              setIntentFilter(intentFilter === intent ? "all" : intent)
            }
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
              intentFilter === intent
                ? INTENT_ACTIVE_COLORS[intent]
                : `${INTENT_COLORS[intent]} hover:opacity-80`
            }`}
          >
            {intent}
          </button>
        ))}
      </div>

      {/* Star list */}
      <div className="max-h-96 overflow-y-auto">
        {filteredStars.length > 0 ? (
          grouped ? (
            // Grouped view
            <div className="space-y-2">
              {Object.entries(grouped).map(([intent, items]) => (
                <div key={intent}>
                  <h5 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted-dark px-2 py-1">
                    {intent}{" "}
                    <span className="opacity-50">({items.length})</span>
                  </h5>
                  <div className="space-y-0.5">
                    {items.map(renderStarItem)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Flat filtered view
            <div className="space-y-0.5">
              {filteredStars.map(renderStarItem)}
            </div>
          )
        ) : stars.length === 0 ? (
          <p className="text-xs italic text-text-muted dark:text-text-muted-dark py-2">
            No starred repos
          </p>
        ) : (
          <p className="text-xs italic text-text-muted dark:text-text-muted-dark py-2">
            No matches
          </p>
        )}
      </div>
    </div>
  );
}
