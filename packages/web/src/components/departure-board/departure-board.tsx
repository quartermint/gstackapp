import type { GroupedProjects } from "../../lib/grouping.js";
import { ProjectGroup } from "./project-group.js";

interface ProjectDetailData {
  commits: { hash: string; message: string; relativeTime: string }[];
  gsdState: { status: string; stoppedAt: string | null; percent: number | null } | null;
}

interface DepartureBoardProps {
  groups: GroupedProjects;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  captureCounts?: Record<string, number>;
  sessionCounts?: Record<string, number>;
  selectedDetail?: ProjectDetailData | null;
  divergedSlugs?: Set<string>;
}

export function DepartureBoard({
  groups,
  selectedSlug,
  onSelect,
  captureCounts,
  sessionCounts,
  selectedDetail,
  divergedSlugs,
}: DepartureBoardProps) {
  return (
    <div>
      {groups.active.length > 0 && (
        <ProjectGroup
          title="Active"
          count={groups.active.length}
          projects={groups.active}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          variant="active"
          captureCounts={captureCounts}
          sessionCounts={sessionCounts}
          selectedDetail={selectedDetail}
          divergedSlugs={divergedSlugs}
        />
      )}
      {groups.idle.length > 0 && (
        <ProjectGroup
          title="Idle"
          count={groups.idle.length}
          projects={groups.idle}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          variant="idle"
          captureCounts={captureCounts}
          sessionCounts={sessionCounts}
          selectedDetail={selectedDetail}
          divergedSlugs={divergedSlugs}
        />
      )}
      {groups.stale.length > 0 && (
        <ProjectGroup
          title="Stale"
          count={groups.stale.length}
          projects={groups.stale}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          variant="stale"
          captureCounts={captureCounts}
          sessionCounts={sessionCounts}
          selectedDetail={selectedDetail}
          divergedSlugs={divergedSlugs}
        />
      )}
    </div>
  );
}
