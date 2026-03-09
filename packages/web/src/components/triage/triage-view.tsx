import { useState, useEffect, useCallback } from "react";
import { useStaleCaptures, type CaptureItem } from "../../hooks/use-captures.js";
import type { ProjectItem } from "../../lib/grouping.js";
import { formatRelativeTime } from "../../lib/time.js";

interface TriageViewProps {
  open: boolean;
  onClose: () => void;
  projects: ProjectItem[];
}

/**
 * Modal overlay for triaging stale captures one at a time.
 *
 * Shows captures older than 2 weeks. User can:
 * - Act: assign to a project (PATCH projectId)
 * - Archive: mark as archived (PATCH status)
 * - Dismiss: permanently delete (DELETE)
 *
 * After each action, advances to the next capture.
 * When all captures are handled, shows "All caught up!" message.
 */
export function TriageView({ open, onClose, projects }: TriageViewProps) {
  const { captures, loading, refetch } = useStaleCaptures();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [actOpen, setActOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  // Reset index when triage opens or captures change
  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setActOpen(false);
      refetch();
    }
  }, [open, refetch]);

  // Close on Esc
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

  const advance = useCallback(() => {
    setActOpen(false);
    // Refetch to get updated list after action
    refetch();
    // Keep index the same since the list will shrink
    // (the item at currentIndex will be a new item after refetch)
  }, [refetch]);

  const handleArchive = useCallback(
    async (capture: CaptureItem) => {
      setActionPending(true);
      try {
        const res = await fetch(`/api/captures/${capture.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "archived" }),
        });
        if (!res.ok) {
          console.error("Failed to archive capture:", res.status);
          return;
        }
        advance();
      } catch (err) {
        console.error("Failed to archive capture:", err);
      } finally {
        setActionPending(false);
      }
    },
    [advance]
  );

  const handleDismiss = useCallback(
    async (capture: CaptureItem) => {
      setActionPending(true);
      try {
        const res = await fetch(`/api/captures/${capture.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          console.error("Failed to dismiss capture:", res.status);
          return;
        }
        advance();
      } catch (err) {
        console.error("Failed to dismiss capture:", err);
      } finally {
        setActionPending(false);
      }
    },
    [advance]
  );

  const handleAct = useCallback(
    async (capture: CaptureItem, projectSlug: string) => {
      setActionPending(true);
      try {
        const res = await fetch(`/api/captures/${capture.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: projectSlug }),
        });
        if (!res.ok) {
          console.error("Failed to link capture to project:", res.status);
          return;
        }
        advance();
      } catch (err) {
        console.error("Failed to link capture to project:", err);
      } finally {
        setActionPending(false);
      }
    },
    [advance]
  );

  if (!open) return null;

  const currentCapture = captures[currentIndex];
  const allDone = !loading && captures.length === 0;
  const total = captures.length;

  return (
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 bg-black/40 z-50 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg bg-surface-elevated dark:bg-surface-elevated-dark rounded-xl shadow-2xl border border-warm-gray/20 animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-warm-gray/10">
            <div>
              <h2 className="text-lg font-semibold text-text-primary dark:text-text-primary-dark">
                Capture Triage
              </h2>
              {!allDone && !loading && (
                <p className="text-xs text-text-muted dark:text-text-muted-dark mt-0.5">
                  {Math.min(currentIndex + 1, total)} of {total} captures
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-text-muted dark:text-text-muted-dark hover:text-text-primary dark:hover:text-text-primary-dark transition-colors text-lg leading-none px-1"
              aria-label="Close triage"
            >
              &times;
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 min-h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center h-[200px]">
                <p className="text-sm text-text-muted dark:text-text-muted-dark">
                  Loading stale captures...
                </p>
              </div>
            ) : allDone ? (
              <div className="flex flex-col items-center justify-center h-[200px] text-center">
                <p className="text-2xl mb-2">All caught up!</p>
                <p className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  No stale captures need attention.
                </p>
                <button
                  onClick={onClose}
                  className="mt-6 px-4 py-2 bg-terracotta text-white text-sm font-medium rounded-lg hover:bg-terracotta/90 transition-colors"
                >
                  Close
                </button>
              </div>
            ) : currentCapture ? (
              <div>
                {/* Capture content */}
                <div className="mb-4">
                  <p className="text-xs text-text-muted dark:text-text-muted-dark mb-2">
                    Captured {formatRelativeTime(currentCapture.createdAt)}
                    {currentCapture.projectId && (
                      <span className="ml-2">
                        &middot; linked to{" "}
                        <span className="font-medium text-terracotta">
                          {projects.find((p) => p.slug === currentCapture.projectId)?.name ??
                            currentCapture.projectId}
                        </span>
                      </span>
                    )}
                  </p>

                  {/* Main content */}
                  <div className="bg-surface dark:bg-surface-dark rounded-lg p-4">
                    <p className="text-text-primary dark:text-text-primary-dark text-sm leading-relaxed whitespace-pre-wrap">
                      {currentCapture.rawContent}
                    </p>
                  </div>

                  {/* Link preview card */}
                  {currentCapture.linkUrl && (
                    <a
                      href={currentCapture.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block mt-3 p-3 rounded-lg border border-warm-gray/15 hover:border-terracotta/30 transition-colors"
                    >
                      {currentCapture.linkTitle && (
                        <p className="text-sm font-medium text-terracotta truncate">
                          {currentCapture.linkTitle}
                        </p>
                      )}
                      {currentCapture.linkDescription && (
                        <p className="text-xs text-text-secondary dark:text-text-secondary-dark line-clamp-2 mt-0.5">
                          {currentCapture.linkDescription}
                        </p>
                      )}
                      <p className="text-[10px] text-text-muted dark:text-text-muted-dark font-mono mt-1">
                        {currentCapture.linkDomain ?? currentCapture.linkUrl}
                      </p>
                    </a>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3 pt-2">
                  {/* Act -- project selector */}
                  <div className="relative flex-1">
                    <button
                      onClick={() => setActOpen(!actOpen)}
                      disabled={actionPending}
                      className="w-full px-4 py-2.5 bg-terracotta text-white text-sm font-medium rounded-lg hover:bg-terracotta/90 transition-colors disabled:opacity-50"
                    >
                      Act
                    </button>
                    {actOpen && (
                      <div className="absolute bottom-full mb-1 left-0 right-0 bg-surface-elevated dark:bg-surface-elevated-dark shadow-lg rounded-lg border border-warm-gray/20 max-h-48 overflow-y-auto z-10">
                        <div className="py-1">
                          {projects.map((project) => (
                            <button
                              key={project.slug}
                              onClick={() => {
                                handleAct(currentCapture, project.slug);
                                setActOpen(false);
                              }}
                              className="w-full text-left px-3 py-1.5 text-sm text-text-primary dark:text-text-primary-dark hover:bg-surface-warm/50 dark:hover:bg-surface-warm-dark/50 transition-colors"
                            >
                              <span className="block truncate">{project.name}</span>
                              <span className="text-[10px] text-text-muted dark:text-text-muted-dark font-mono">
                                {project.slug}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Archive */}
                  <button
                    onClick={() => handleArchive(currentCapture)}
                    disabled={actionPending}
                    className="flex-1 px-4 py-2.5 bg-warm-gray/15 text-text-secondary dark:text-text-secondary-dark text-sm font-medium rounded-lg hover:bg-warm-gray/25 transition-colors disabled:opacity-50"
                  >
                    Archive
                  </button>

                  {/* Dismiss */}
                  <button
                    onClick={() => handleDismiss(currentCapture)}
                    disabled={actionPending}
                    className="flex-1 px-4 py-2.5 bg-rust/10 text-rust text-sm font-medium rounded-lg hover:bg-rust/20 transition-colors disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
