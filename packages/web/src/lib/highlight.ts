import type { ProjectItem } from "./grouping.js";

/**
 * Compute which projects have changed since the user's last visit.
 * Returns empty set on first visit (null lastVisitAt).
 */
export function computeChangedSlugs(
  projects: ProjectItem[],
  lastVisitAt: string | null
): Set<string> {
  if (!lastVisitAt) return new Set();
  const visitTime = new Date(lastVisitAt).getTime();
  const changed = new Set<string>();
  for (const project of projects) {
    if (!project.lastCommitDate) continue;
    const commitTime = new Date(project.lastCommitDate).getTime();
    if (commitTime > visitTime) {
      changed.add(project.slug);
    }
  }
  return changed;
}

/**
 * Sort projects with changed ones first, preserving most-recent-first
 * within each subset (changed and unchanged).
 */
export function sortWithChangedFirst(
  projects: ProjectItem[],
  changedSlugs: Set<string>
): ProjectItem[] {
  if (changedSlugs.size === 0) return projects;
  return [...projects].sort((a, b) => {
    const aChanged = changedSlugs.has(a.slug) ? 0 : 1;
    const bChanged = changedSlugs.has(b.slug) ? 0 : 1;
    if (aChanged !== bChanged) return aChanged - bChanged;
    const aTime = a.lastCommitDate ? new Date(a.lastCommitDate).getTime() : 0;
    const bTime = b.lastCommitDate ? new Date(b.lastCommitDate).getTime() : 0;
    return bTime - aTime;
  });
}
