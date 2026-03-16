import { useState, useEffect, useRef } from "react";
import type { DiscoveryItem } from "../../hooks/use-discoveries.js";
import { HostBadge } from "../ui/host-badge.js";
import { formatRelativeTime } from "../../lib/time.js";

interface DiscoveryPopoverProps {
  discoveries: DiscoveryItem[];
  open: boolean;
  onClose: () => void;
  onPromote: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function DiscoveryPopover({
  discoveries,
  open,
  onClose,
  onPromote,
  onDismiss,
}: DiscoveryPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // Close on click outside (matches sessions-indicator.tsx pattern exactly)
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    // Delay adding the listener to avoid the triggering click
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

  if (!open) return null;

  function handlePromote(id: string) {
    setPendingIds((prev) => new Set(prev).add(id));
    onPromote(id);
  }

  function handleDismiss(id: string) {
    setPendingIds((prev) => new Set(prev).add(id));
    onDismiss(id);
  }

  return (
    <div
      ref={panelRef}
      className="absolute top-full left-0 mt-1 w-96 bg-surface dark:bg-surface-dark border border-black/10 dark:border-white/10 rounded-lg shadow-lg p-3 z-50"
    >
      {/* Header */}
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted-dark mb-2">
        Discovered Repos
      </h4>

      {/* Discovery list */}
      <div className="max-h-80 overflow-y-auto">
        {discoveries.length > 0 ? (
          <div className="space-y-0.5">
            {discoveries.map((d) => {
              const displayName = d.name ?? d.path.split("/").pop() ?? d.path;
              const isPending = pendingIds.has(d.id);

              return (
                <div
                  key={d.id}
                  className={`flex items-start justify-between gap-2 px-2 py-2 rounded-lg hover:bg-surface-warm/40 dark:hover:bg-surface-warm-dark/30 transition-colors ${isPending ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-text-primary dark:text-text-primary-dark truncate">
                        {displayName}
                      </span>
                      <HostBadge host={d.host} />
                    </div>
                    {d.remoteUrl && (
                      <p className="text-[10px] font-mono text-text-muted dark:text-text-muted-dark truncate mt-0.5">
                        {d.remoteUrl}
                      </p>
                    )}
                    <p className="text-[10px] text-text-muted dark:text-text-muted-dark mt-0.5">
                      Last commit:{" "}
                      {d.lastCommitAt
                        ? formatRelativeTime(d.lastCommitAt)
                        : "unknown"}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handlePromote(d.id)}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sage/12 text-sage hover:bg-sage/20 transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      Track
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDismiss(d.id)}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warm-gray/8 text-text-muted dark:text-text-muted-dark hover:bg-warm-gray/15 transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs italic text-text-muted dark:text-text-muted-dark py-2">
            No new discoveries
          </p>
        )}
      </div>
    </div>
  );
}
