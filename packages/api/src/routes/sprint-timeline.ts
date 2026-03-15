import { Hono } from "hono";
import { getHeatmapData, type HeatmapEntry } from "../db/queries/commits.js";
import type { DatabaseInstance } from "../db/index.js";

// ── Types ──────────────────────────────────────────────────────────

export interface TimelineSegment {
  startDate: string;
  endDate: string;
  commits: number;
  density: number;
}

// ── Segment Computation ────────────────────────────────────────────

/**
 * Compute activity segments from heatmap entries for a single project.
 *
 * Algorithm:
 * 1. Sort entries by date ascending.
 * 2. Walk entries: if gap between current and previous > gapDays, close
 *    current segment and start a new one.
 * 3. Density = segCommits / (maxDaily * daysInSegment), clamped to [0, 1].
 *    This normalizes per-project so visual comparison is meaningful.
 *
 * Exported for direct unit testing.
 */
export function computeSegments(
  entries: HeatmapEntry[],
  gapDays: number = 3
): TimelineSegment[] {
  if (entries.length === 0) return [];

  // Sort by date ascending
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  // Compute maxDaily across all entries for this project
  const maxDaily = Math.max(...sorted.map((e) => e.count));
  if (maxDaily === 0) return [];

  const segments: TimelineSegment[] = [];
  const first = sorted[0]!;
  let segStart = first.date;
  let segEnd = first.date;
  let segCommits = first.count;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;

    // Calculate day gap between entries
    const prevTime = new Date(prev.date).getTime();
    const currTime = new Date(curr.date).getTime();
    const daysDiff = Math.round((currTime - prevTime) / (24 * 60 * 60 * 1000));

    if (daysDiff > gapDays) {
      // Close the current segment
      const daysInSegment = daysBetween(segStart, segEnd);
      segments.push({
        startDate: segStart,
        endDate: segEnd,
        commits: segCommits,
        density: Math.min(segCommits / (maxDaily * daysInSegment), 1),
      });

      // Start new segment
      segStart = curr.date;
      segEnd = curr.date;
      segCommits = curr.count;
    } else {
      segEnd = curr.date;
      segCommits += curr.count;
    }
  }

  // Close final segment
  const daysInSegment = daysBetween(segStart, segEnd);
  segments.push({
    startDate: segStart,
    endDate: segEnd,
    commits: segCommits,
    density: Math.min(segCommits / (maxDaily * daysInSegment), 1),
  });

  return segments;
}

/** Calculate inclusive day count between two YYYY-MM-DD date strings. */
function daysBetween(start: string, end: string): number {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  return Math.round((endTime - startTime) / (24 * 60 * 60 * 1000)) + 1;
}

// ── Route Factory ──────────────────────────────────────────────────

/**
 * Sprint timeline routes: segment-based activity data for swimlane visualization.
 *
 * GET /sprint-timeline           — All project segments for the default 12-week window
 * GET /sprint-timeline?weeks=4   — Custom time window (1-52 weeks)
 */
export function createSprintTimelineRoutes(
  getInstance: () => DatabaseInstance
) {
  return new Hono().get("/sprint-timeline", (c) => {
    const weeksParam = c.req.query("weeks");
    const weeks = weeksParam
      ? Math.min(Math.max(1, parseInt(weeksParam, 10) || 12), 52)
      : 12;
    const windowDays = weeks * 7;

    const heatmap = getHeatmapData(getInstance().db, weeks);

    // Group entries by project
    const byProject = new Map<string, HeatmapEntry[]>();
    for (const entry of heatmap) {
      const arr = byProject.get(entry.projectSlug) ?? [];
      arr.push(entry);
      byProject.set(entry.projectSlug, arr);
    }

    // Compute segments per project, sorted by most recent activity
    const projects = Array.from(byProject.entries())
      .map(([slug, entries]) => ({
        slug,
        segments: computeSegments(entries),
        totalCommits: entries.reduce((sum, e) => sum + e.count, 0),
        lastActivity: Math.max(...entries.map((e) => new Date(e.date).getTime())),
      }))
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .map(({ lastActivity: _, ...rest }) => rest);

    // Focused project: most commits in last 7 days
    const sevenDaysAgo =
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0] ?? "";
    let focusedProject: string | null = null;
    let maxRecent = 0;
    for (const [slug, entries] of byProject) {
      const recent = entries
        .filter((e) => e.date >= sevenDaysAgo)
        .reduce((sum, e) => sum + e.count, 0);
      if (recent > maxRecent) {
        maxRecent = recent;
        focusedProject = slug;
      }
    }

    return c.json({ projects, focusedProject, windowDays });
  });
}
