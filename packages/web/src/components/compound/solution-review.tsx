import { useState } from "react";
import type { SolutionItem } from "../../hooks/use-solutions.js";

interface SolutionReviewProps {
  solutions: SolutionItem[];
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onEditTitle: (id: string, title: string) => void;
  isPending: boolean;
}

/**
 * Solution candidate review section.
 * Only renders when there are candidates. Collapsible with accept/edit/dismiss actions.
 * Cards animate out on action via CSS transitions.
 */
export function SolutionReview({
  solutions,
  onAccept,
  onDismiss,
  onEditTitle,
  isPending,
}: SolutionReviewProps) {
  const [expanded, setExpanded] = useState(true);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  if (solutions.length === 0) return null;

  const handleAction = (id: string, action: "accept" | "dismiss") => {
    setExitingIds((prev) => new Set([...prev, id]));
    // Wait for animation to complete before triggering the actual action
    setTimeout(() => {
      if (action === "accept") {
        onAccept(id);
      } else {
        onDismiss(id);
      }
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 300);
  };

  return (
    <div className="bg-warm-gray/5 dark:bg-warm-gray/8 rounded-xl p-4">
      {/* Header: collapsible toggle */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-2 w-full text-left group"
      >
        <svg
          className={`w-3.5 h-3.5 text-text-muted dark:text-text-muted-dark transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark group-hover:text-text-secondary dark:group-hover:text-text-secondary-dark transition-colors">
          Solution Candidates ({solutions.length})
        </span>
      </button>

      {/* Cards */}
      {expanded && (
        <div className="mt-3 space-y-2">
          {solutions.map((solution) => (
            <SolutionCard
              key={solution.id}
              solution={solution}
              exiting={exitingIds.has(solution.id)}
              onAccept={() => handleAction(solution.id, "accept")}
              onDismiss={() => handleAction(solution.id, "dismiss")}
              onEditTitle={(title) => onEditTitle(solution.id, title)}
              disabled={isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SolutionCardProps {
  solution: SolutionItem;
  exiting: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  onEditTitle: (title: string) => void;
  disabled: boolean;
}

function SolutionCard({
  solution,
  exiting,
  onAccept,
  onDismiss,
  onEditTitle,
  disabled,
}: SolutionCardProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(solution.title);

  const snippet =
    solution.symptoms ?? solution.rootCause ?? solution.content;
  const truncated =
    snippet.length > 100 ? `${snippet.slice(0, 100)}...` : snippet;

  const handleSaveTitle = () => {
    if (editValue.trim() && editValue !== solution.title) {
      onEditTitle(editValue.trim());
    }
    setEditing(false);
  };

  return (
    <div
      className={`solution-card-exit rounded-lg border border-warm-gray/10 dark:border-warm-gray/6 bg-surface-elevated dark:bg-surface-elevated-dark p-3 ${
        exiting ? "exiting" : ""
      }`}
    >
      {/* Title row */}
      <div className="flex items-start gap-2 min-w-0">
        {editing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveTitle();
              if (e.key === "Escape") {
                setEditValue(solution.title);
                setEditing(false);
              }
            }}
            className="flex-1 text-sm font-semibold bg-transparent border-b border-terracotta/40 outline-none text-text-primary dark:text-text-primary-dark"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm font-semibold text-text-primary dark:text-text-primary-dark truncate">
            {solution.title}
          </span>
        )}
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        {solution.projectSlug && (
          <span className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-warm-gray/8 dark:bg-warm-gray/12 text-text-secondary dark:text-text-secondary-dark">
            {solution.projectSlug}
          </span>
        )}
        {solution.problemType && (
          <span className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-terracotta/10 text-terracotta">
            {solution.problemType}
          </span>
        )}
      </div>

      {/* Snippet */}
      <p className="text-xs text-text-muted dark:text-text-muted-dark mt-2 leading-relaxed">
        {truncated}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={onAccept}
          disabled={disabled}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-sage/12 text-sage hover:bg-sage/20 transition-colors disabled:opacity-50"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={disabled}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-warm-gray/8 text-text-secondary dark:text-text-secondary-dark hover:bg-warm-gray/15 transition-colors disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={disabled}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-rust/8 text-rust/70 hover:bg-rust/15 hover:text-rust transition-colors disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
