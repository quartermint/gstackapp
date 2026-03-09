import type { CaptureItem } from "../../hooks/use-captures.js";
import type { ProjectItem } from "../../lib/grouping.js";
import { CaptureCard } from "../capture/capture-card.js";

interface LooseThoughtsProps {
  captures: CaptureItem[];
  projects: ProjectItem[];
  onCorrected: () => void;
}

/**
 * Section below the departure board showing unlinked captures (no project assigned).
 *
 * Renders each unlinked capture as a CaptureCard with correction capability.
 * Smaller visual treatment than the departure board -- visible but not competing
 * with project status info.
 *
 * If no unlinked captures exist, this section is not rendered at all.
 */
export function LooseThoughts({
  captures,
  projects,
  onCorrected,
}: LooseThoughtsProps) {
  if (captures.length === 0) return null;

  return (
    <section className="mt-6">
      <h3 className="uppercase text-xs font-semibold tracking-wider mb-2 px-3 text-text-muted dark:text-text-muted-dark">
        Loose Thoughts{" "}
        <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-warm-gray/15 text-[10px] font-medium ml-1">
          {captures.length}
        </span>
      </h3>
      <div className="space-y-1.5 pl-2 border-l-2 border-warm-gray/20 dark:border-warm-gray/10 ml-1">
        {captures.map((capture) => (
          <CaptureCard
            key={capture.id}
            capture={capture}
            projects={projects}
            onCorrected={onCorrected}
          />
        ))}
      </div>
    </section>
  );
}
