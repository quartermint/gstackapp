import type { GroupedProjects } from "../../lib/grouping.js";
import { sortWithChangedFirst } from "../../lib/highlight.js";
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
  convergenceCounts?: Record<string, { sessionCount: number; fileCount: number }>;
  selectedDetail?: ProjectDetailData | null;
  divergedSlugs?: Set<string>;
  changedSlugs?: Set<string>;
}

export function DepartureBoard({
  groups,
  selectedSlug,
  onSelect,
  captureCounts,
  sessionCounts,
  convergenceCounts,
  selectedDetail,
  divergedSlugs,
  changedSlugs,
}: DepartureBoardProps) {
  const sortedActive = changedSlugs ? sortWithChangedFirst(groups.active, changedSlugs) : groups.active;
  const sortedIdle = changedSlugs ? sortWithChangedFirst(groups.idle, changedSlugs) : groups.idle;
  const sortedStale = changedSlugs ? sortWithChangedFirst(groups.stale, changedSlugs) : groups.stale;

  return (
    <div>
      {sortedActive.length > 0 && (
        <ProjectGroup
          title="Active"
          count={sortedActive.length}
          projects={sortedActive}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          variant="active"
          captureCounts={captureCounts}
          sessionCounts={sessionCounts}
          selectedDetail={selectedDetail}
          convergenceCounts={convergenceCounts}
          divergedSlugs={divergedSlugs}
          changedSlugs={changedSlugs}
        />
      )}
      {sortedIdle.length > 0 && (
        <ProjectGroup
          title="Idle"
          count={sortedIdle.length}
          projects={sortedIdle}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          variant="idle"
          captureCounts={captureCounts}
          sessionCounts={sessionCounts}
          convergenceCounts={convergenceCounts}
          selectedDetail={selectedDetail}
          divergedSlugs={divergedSlugs}
          changedSlugs={changedSlugs}
        />
      )}
      {sortedStale.length > 0 && (
        <ProjectGroup
          title="Stale"
          count={sortedStale.length}
          projects={sortedStale}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          variant="stale"
          captureCounts={captureCounts}
          sessionCounts={sessionCounts}
          convergenceCounts={convergenceCounts}
          selectedDetail={selectedDetail}
          divergedSlugs={divergedSlugs}
          changedSlugs={changedSlugs}
        />
      )}
    </div>
  );
}
