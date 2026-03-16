import type { ProjectItem } from "../../lib/grouping.js";
import { ProjectRow } from "./project-row.js";

interface ProjectDetailData {
  commits: { hash: string; message: string; relativeTime: string }[];
  gsdState: { status: string; stoppedAt: string | null; percent: number | null } | null;
}

interface ProjectGroupProps {
  title: string;
  count: number;
  projects: ProjectItem[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  variant: "active" | "idle" | "stale";
  captureCounts?: Record<string, number>;
  sessionCounts?: Record<string, number>;
  selectedDetail?: ProjectDetailData | null;
  divergedSlugs?: Set<string>;
}

const VARIANT_COLORS: Record<string, string> = {
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
  captureCounts,
  sessionCounts,
  selectedDetail,
  divergedSlugs,
}: ProjectGroupProps) {
  return (
    <section className="mb-6">
      {/* Centered section divider */}
      <div className="section-divider mb-3">
        <h3
          className={`text-[11px] uppercase font-semibold tracking-widest whitespace-nowrap ${VARIANT_COLORS[variant]}`}
        >
          {title}
          <span className="text-text-muted dark:text-text-muted-dark font-normal ml-1.5">
            {count}
          </span>
        </h3>
      </div>
      <div className="space-y-0.5">
        {projects.map((project) => {
          const isSelected = selectedSlug === project.slug;
          return (
            <ProjectRow
              key={project.slug}
              project={project}
              isSelected={isSelected}
              onSelect={onSelect}
              captureCount={captureCounts?.[project.slug]}
              sessionCount={sessionCounts?.[project.slug]}
              commits={isSelected ? selectedDetail?.commits : undefined}
              gsdState={isSelected ? selectedDetail?.gsdState : undefined}
              riskLevel={project.riskLevel}
              hasDivergedCopies={divergedSlugs?.has(project.slug) ?? false}
            />
          );
        })}
      </div>
    </section>
  );
}
