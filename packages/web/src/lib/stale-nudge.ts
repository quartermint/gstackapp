const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_DAYS = 14;

interface StaleCheckProject {
  lastCommitDate: string | null;
  dirty: boolean | null;
  dirtyFiles: string[];
}

interface NudgeMessageProject {
  lastCommitDate: string | null;
  dirtyFiles: string[];
}

/**
 * Check if a project is stale with uncommitted dirty files.
 * Returns true when the project has been idle for more than 14 days
 * AND has dirty (uncommitted) files.
 */
export function isStaleWithDirty(project: StaleCheckProject): boolean {
  if (!project.lastCommitDate || project.dirty !== true) return false;
  if (project.dirtyFiles.length === 0) return false;

  const daysIdle =
    (Date.now() - new Date(project.lastCommitDate).getTime()) / DAY_MS;

  return daysIdle > STALE_THRESHOLD_DAYS;
}

/**
 * Generate a human-readable nudge message for a stale project.
 * Returns empty string if lastCommitDate is null.
 */
export function getStaleNudgeMessage(project: NudgeMessageProject): string {
  if (!project.lastCommitDate) return "";

  const daysIdle = Math.floor(
    (Date.now() - new Date(project.lastCommitDate).getTime()) / DAY_MS
  );

  return `uncommitted changes -- ${daysIdle} days idle`;
}
