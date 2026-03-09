import type { ProjectItem } from "../../lib/grouping.js";
import { ProjectRow } from "./project-row.js";

interface ProjectGroupProps {
  title: string;
  count: number;
  projects: ProjectItem[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  variant: "active" | "idle" | "stale";
}

const VARIANT_STYLES: Record<string, string> = {
  active: "text-terracotta",
  idle: "text-gold-status",
  stale: "text-text-muted dark:text-text-muted-dark",
};

export function ProjectGroup({
  title,
  count,
  projects,
  selectedSlug,
  onSelect,
  variant,
}: ProjectGroupProps) {
  return (
    <section className="mb-4">
      <h3
        className={`uppercase text-xs font-semibold tracking-wider mb-1.5 px-3 ${VARIANT_STYLES[variant]}`}
      >
        {title}{" "}
        <span className="text-text-muted dark:text-text-muted-dark font-normal">
          ({count})
        </span>
      </h3>
      <div className="space-y-0.5">
        {projects.map((project) => (
          <ProjectRow
            key={project.slug}
            project={project}
            isSelected={selectedSlug === project.slug}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
