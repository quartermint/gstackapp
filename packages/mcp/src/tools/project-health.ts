import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchApi } from "../api-client.js";
import { textContent, errorContent } from "../format.js";

interface Project {
  slug: string;
  name: string;
  healthScore: number | null;
  riskLevel: string;
  copyCount: number;
  lastCommitTime: string | null;
}

interface Finding {
  projectSlug: string;
  checkType: string;
  severity: string;
  detail: string;
}

export function registerProjectHealth(server: McpServer): void {
  server.registerTool(
    "project_health",
    {
      description:
        "Health report across all projects. Shows health score, risk level, copy count, and last activity for every tracked project.",
    },
    async () => {
      try {
        const [projectsData, healthData] = await Promise.all([
          fetchApi<{ projects: Project[] }>("/api/projects"),
          fetchApi<{ findings: Finding[]; total: number }>("/api/health-checks"),
        ]);

        const { projects } = projectsData;
        const { findings, total } = healthData;

        const lines: string[] = [];
        lines.push(`PROJECT HEALTH REPORT (${projects.length} projects, ${total} findings)`);
        lines.push("─".repeat(70));

        for (const p of projects) {
          const score = p.healthScore !== null ? String(p.healthScore) : "—";
          const lastActivity = p.lastCommitTime
            ? new Date(p.lastCommitTime).toLocaleDateString()
            : "never";
          lines.push(
            `${p.name} (${p.slug}): score=${score} risk=${p.riskLevel} copies=${p.copyCount} last=${lastActivity}`,
          );
        }

        if (findings.length > 0) {
          lines.push("");
          lines.push(`FINDINGS (${findings.length}):`);
          for (const f of findings) {
            lines.push(`  [${f.severity}] ${f.projectSlug}: ${f.checkType} — ${f.detail}`);
          }
        }

        return textContent(lines.join("\n"));
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
