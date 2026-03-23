import type { CaptureItem } from "../../hooks/use-captures.js";
import type { ProjectItem } from "../../lib/grouping.js";
import { CaptureCard } from "../capture/capture-card.js";

interface LooseThoughtsProps {
  captures: CaptureItem[];
  projects: ProjectItem[];
  onCorrected: () => void;
}

export function LooseThoughts({
  captures,
  projects,
  onCorrected,
}: LooseThoughtsProps) {
  if (captures.length === 0) return null;

  return (
    <section>
      {/* Centered section divider */}
      <div className="section-divider mb-3">
        <h3 className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark whitespace-nowrap">
          Loose Thoughts
          <span className="inline-flex items-center justify-center h-[16px] min-w-[16px] px-1 rounded-full bg-warm-gray/12 text-[10px] font-medium ml-1.5 align-middle">
            {captures.length}
          </span>
        </h3>
      </div>
      <div className="space-y-1.5 pl-3 border-l-2 border-warm-gray/15 dark:border-warm-gray/8 ml-1">
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
