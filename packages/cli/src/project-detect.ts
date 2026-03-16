import { listProjects, McApiUnreachable } from "./api-client.js";

/**
 * Detect project from current working directory.
 * Fetches all projects from API and finds the one whose `path` matches
 * or is a parent of the given cwd.
 *
 * Returns the project slug or null if no match / API unreachable.
 */
export async function detectProjectFromCwd(cwd: string): Promise<string | null> {
  try {
    const { projects } = await listProjects();

    // Find the project whose path is the longest prefix of cwd
    // (handles nested directories within a project)
    let bestMatch: { slug: string; pathLen: number } | null = null;

    for (const project of projects) {
      if (!project.path) continue;
      const projectPath = project.path.replace(/\/$/, ""); // trim trailing slash
      if (cwd === projectPath || cwd.startsWith(projectPath + "/")) {
        if (!bestMatch || projectPath.length > bestMatch.pathLen) {
          bestMatch = { slug: project.slug, pathLen: projectPath.length };
        }
      }
    }

    return bestMatch?.slug ?? null;
  } catch (e) {
    if (e instanceof McApiUnreachable) return null;
    throw e;
  }
}
