export type ActivityGroup = "active" | "idle" | "stale";

/**
 * Shape of a project as returned by the /api/projects list endpoint.
 * Defined locally per plan instructions (no runtime import from shared).
 */
export interface ProjectItem {
  slug: string;
  name: string;
  tagline: string | null;
  path: string;
  host: "local" | "mac-mini" | "github";
  branch: string | null;
  dirty: boolean | null;
  dirtyFiles: string[];
  lastCommitHash: string | null;
  lastCommitMessage: string | null;
  lastCommitTime: string | null;
  lastCommitDate: string | null;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Health score (0-100), null if unmonitored. Added in Phase 8. */
  healthScore: number | null;
  /** Worst active finding severity. Defaults to "unmonitored" if not present. */
  riskLevel: "healthy" | "warning" | "critical" | "unmonitored";
  /** Number of copies of this project across hosts. */
  copyCount: number;
}

export interface GroupedProjects {
  active: ProjectItem[];
  idle: ProjectItem[];
  stale: ProjectItem[];
}

const ACTIVE_THRESHOLD_DAYS = 7;
const IDLE_THRESHOLD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Group projects by activity level based on last commit date.
 *
 * - Active: commit within 7 days (inclusive)
 * - Idle: commit 8-30 days ago (inclusive)
 * - Stale: commit 31+ days ago or no commit date
 *
 * Each group is sorted by most recent commit first.
 */
export function groupProjectsByActivity(
  projects: ProjectItem[]
): GroupedProjects {
  const now = Date.now();
  const groups: GroupedProjects = { active: [], idle: [], stale: [] };

  for (const project of projects) {
    if (!project.lastCommitDate) {
      groups.stale.push(project);
      continue;
    }

    const commitTime = new Date(project.lastCommitDate).getTime();
    const daysAgo = (now - commitTime) / DAY_MS;

    if (daysAgo <= ACTIVE_THRESHOLD_DAYS) {
      groups.active.push(project);
    } else if (daysAgo <= IDLE_THRESHOLD_DAYS) {
      groups.idle.push(project);
    } else {
      groups.stale.push(project);
    }
  }

  // Sort each group by most recent commit first
  const sortByRecent = (a: ProjectItem, b: ProjectItem) => {
    const aTime = a.lastCommitDate
      ? new Date(a.lastCommitDate).getTime()
      : 0;
    const bTime = b.lastCommitDate
      ? new Date(b.lastCommitDate).getTime()
      : 0;
    return bTime - aTime;
  };

  groups.active.sort(sortByRecent);
  groups.idle.sort(sortByRecent);
  groups.stale.sort(sortByRecent);

  return groups;
}
