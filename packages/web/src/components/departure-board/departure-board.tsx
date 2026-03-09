import type { GroupedProjects } from "../../lib/grouping.js";
import { ProjectGroup } from "./project-group.js";

interface DepartureBoardProps {
  groups: GroupedProjects;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  captureCounts?: Record<string, number>;
}

export function DepartureBoard({
  groups,
  selectedSlug,
  onSelect,
  captureCounts,
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
        />
      )}
    </div>
  );
}
