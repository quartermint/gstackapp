import { Command } from "cmdk";
import type { SearchResult } from "../../hooks/use-search.js";
import { parseSnippet, truncateSnippet } from "../../lib/search-utils.js";
import { formatRelativeTime } from "../../lib/time.js";

interface SearchResultItemProps {
  result: SearchResult;
  onSelect: () => void;
  index?: number;
}

const SOURCE_BADGE_STYLES: Record<SearchResult["sourceType"], string> = {
  capture:
    "bg-terracotta/15 text-terracotta dark:bg-terracotta/25 dark:text-terracotta",
  commit:
    "bg-warm-accent/15 text-warm-accent dark:bg-warm-accent/25 dark:text-warm-accent",
  project:
    "bg-olive/15 text-olive dark:bg-olive/25 dark:text-olive",
  knowledge:
    "bg-warm-gray/15 text-warm-gray dark:bg-warm-gray/25 dark:text-warm-gray",
};

/**
 * A single search result row for the command palette.
 *
 * Layout: [source badge] [highlighted snippet ...] [timestamp]
 *
 * Source badges use theme-consistent colors:
 * - capture: terracotta
 * - commit: warm-accent (blue-ish)
 * - project: olive (green)
 */
export function SearchResultItem({ result, onSelect, index = 0 }: SearchResultItemProps) {
  const truncated = truncateSnippet(result.snippet, 120);
  const segments = parseSnippet(truncated);

  return (
    <Command.Item
      value={`search-${result.sourceType}-${result.sourceId}-${index}`}
      onSelect={onSelect}
      className="cmdk-item"
    >
      {/* Source type badge */}
      <span
        className={[
          "inline-flex items-center shrink-0",
          "px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide mr-2",
          SOURCE_BADGE_STYLES[result.sourceType],
        ].join(" ")}
      >
        {result.sourceType}
      </span>

      {/* Highlighted snippet */}
      <span className="truncate flex-1 text-sm">
        {segments.map((seg, i) =>
          seg.highlighted ? (
            <span
              key={i}
              className="bg-yellow-200/40 dark:bg-yellow-500/30 font-medium"
            >
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </span>

      {/* Relative timestamp */}
      <span className="ml-2 text-xs text-text-muted dark:text-text-muted-dark shrink-0">
        {formatRelativeTime(result.createdAt)}
      </span>
    </Command.Item>
  );
}
