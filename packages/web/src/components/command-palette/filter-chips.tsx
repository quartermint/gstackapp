import type { SearchFilters } from "../../hooks/use-search.js";

interface FilterChipsProps {
  filters: SearchFilters;
  onRemoveFilter: (key: keyof SearchFilters) => void;
}

/**
 * Format a filter value for display in a chip.
 */
function formatFilterLabel(key: keyof SearchFilters, value: string): string {
  switch (key) {
    case "project":
      return `project: ${value}`;
    case "type":
      return `type: ${value}`;
    case "dateAfter":
      return `after: ${formatDateShort(value)}`;
    case "dateBefore":
      return `before: ${formatDateShort(value)}`;
    default:
      return `${key}: ${value}`;
  }
}

/**
 * Format an ISO date string to a short display format (e.g., "Mar 1").
 */
function formatDateShort(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

/**
 * Dismissible filter chips showing AI-extracted search filters.
 *
 * Renders a horizontal row of small chips for non-null filter values.
 * Each chip shows the filter label and an X button to dismiss.
 * Renders nothing when all filters are null.
 */
export function FilterChips({ filters, onRemoveFilter }: FilterChipsProps) {
  const entries = (Object.entries(filters) as [keyof SearchFilters, string | null][])
    .filter((entry): entry is [keyof SearchFilters, string] => entry[1] !== null);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-1.5 border-b border-warm-gray/20">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className={[
            "inline-flex items-center gap-1",
            "bg-warm-gray/10 border border-warm-gray/20",
            "rounded-full px-2 py-0.5",
            "text-xs text-text-secondary dark:text-text-secondary-dark",
          ].join(" ")}
        >
          {formatFilterLabel(key, value)}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFilter(key);
            }}
            className="ml-0.5 hover:text-text-primary dark:hover:text-text-primary-dark transition-colors"
            aria-label={`Remove ${key} filter`}
          >
            x
          </button>
        </span>
      ))}
    </div>
  );
}
