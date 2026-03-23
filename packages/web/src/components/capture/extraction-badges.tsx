/**
 * Extraction type badges for capture cards.
 *
 * Displays colored badges for each extraction type found in a capture:
 * Action (amber), Idea (violet), Question (sky), Link (emerald).
 * Project refs are excluded since they're already shown via the project badge.
 *
 * Per D-05, D-08: makes action items, ideas, and questions immediately visible
 * on capture cards without expanding or navigating.
 */

export type ExtractionType =
  | "project_ref"
  | "action_item"
  | "idea"
  | "link"
  | "question";

export interface Extraction {
  type: ExtractionType;
  text: string;
  confidence: number;
}

const TYPE_STYLES: Record<ExtractionType, string> = {
  action_item:
    "bg-amber-500/10 text-amber-600 border border-amber-500/20",
  idea: "bg-violet-500/10 text-violet-600 border border-violet-500/20",
  question: "bg-sky-500/10 text-sky-600 border border-sky-500/20",
  link: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
  project_ref:
    "bg-terracotta/10 text-terracotta border border-terracotta/20",
};

const TYPE_LABELS: Record<ExtractionType, string> = {
  action_item: "Action",
  idea: "Idea",
  question: "Question",
  link: "Link",
  project_ref: "Ref",
};

/**
 * Render extraction type badges for a capture card.
 * Filters out project_ref (already shown via project badge).
 */
export function ExtractionBadges({
  extractions,
}: {
  extractions: Extraction[];
}) {
  // Filter out project_ref — already shown via the project badge
  const visible = extractions.filter((e) => e.type !== "project_ref");

  if (visible.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1">
      {visible.map((extraction, i) => (
        <span
          key={`${extraction.type}-${i}`}
          className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 ${TYPE_STYLES[extraction.type] ?? ""}`}
          title={extraction.text}
        >
          {TYPE_LABELS[extraction.type] ?? extraction.type}
        </span>
      ))}
    </span>
  );
}
