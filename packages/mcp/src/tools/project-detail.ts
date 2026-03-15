import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchApi } from "../api-client.js";
import { textContent, errorContent } from "../format.js";

interface ProjectResponse {
  project: {
    slug: string;
    name: string;
    host: string;
    branch: string;
    dirty: boolean;
    dirtyFiles: string[];
    lastCommitHash: string;
    lastCommitMessage: string;
    lastCommitTime: string | null;
  };
}

interface Finding {
  projectSlug: string;
  checkType: string;
  severity: string;
  detail: string;
}

interface HealthChecksResponse {
  findings: Finding[];
  riskLevel: string;
}

interface Copy {
  projectSlug: string;
  host: string;
  branch: string;
  headHash: string;
  isStale: boolean;
}

interface CopiesResponse {
  copies: Copy[];
  projectSlug: string;
}

export function registerProjectDetail(server: McpServer): void {
  server.registerTool(
    "project_detail",
    {
      description:
        "Deep status for a single project. Returns branch info, dirty state, latest commit, health findings, and copy locations.",
      inputSchema: {
        slug: z.string().describe("Project slug (e.g., mission-control)"),
      },
    },
    async ({ slug }) => {
      try {
        const [projectData, healthData, copiesData] = await Promise.all([
          fetchApi<ProjectResponse>(`/api/projects/${slug}`),
          fetchApi<HealthChecksResponse>(`/api/health-checks/${slug}`),
          fetchApi<CopiesResponse>(`/api/copies/${slug}`),
        ]);

        const { project } = projectData;
        const { findings, riskLevel } = healthData;
        const { copies } = copiesData;

        const lines: string[] = [];
        lines.push(`PROJECT: ${project.name} (${project.slug})`);
        lines.push("─".repeat(50));
        lines.push(`Host: ${project.host}`);
        lines.push(`Branch: ${project.branch}`);
        lines.push(`Status: ${project.dirty ? "dirty" : "clean"}`);
        if (project.dirty && project.dirtyFiles?.length > 0) {
          lines.push(`Dirty files: ${project.dirtyFiles.join(", ")}`);
        }
        lines.push(`Last commit: ${project.lastCommitHash} — ${project.lastCommitMessage}`);
        if (project.lastCommitTime) {
          lines.push(`Committed: ${new Date(project.lastCommitTime).toLocaleString()}`);
        }
        lines.push(`Risk level: ${riskLevel}`);

        if (findings.length > 0) {
          lines.push(`\nFINDINGS (${findings.length}):`);
          for (const f of findings) {
            lines.push(`  [${f.severity}] ${f.checkType} — ${f.detail}`);
          }
        }

        if (copies.length > 0) {
          lines.push(`\nCOPIES (${copies.length}):`);
          for (const c of copies) {
            const staleTag = c.isStale ? " [stale]" : "";
            lines.push(`  ${c.host}: ${c.branch} @ ${c.headHash}${staleTag}`);
          }
        }

        return textContent(lines.join("\n"));
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
