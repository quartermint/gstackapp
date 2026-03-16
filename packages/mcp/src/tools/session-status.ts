import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchApi } from "../api-client.js";
import { textContent, errorContent } from "../format.js";

interface SessionItem {
  id: string;
  source: string;
  model: string | null;
  tier: string;
  projectSlug: string | null;
  status: string;
  filesJson: string | null;
  startedAt: string;
  lastHeartbeatAt: string | null;
}

export function registerSessionStatus(server: McpServer): void {
  server.registerTool(
    "session_status",
    {
      description:
        "Active coding sessions. Shows session ID, project, start time, file count, agent type, and model tier for all active sessions.",
    },
    async () => {
      try {
        const data = await fetchApi<{ sessions: SessionItem[]; total: number }>(
          "/api/sessions?status=active&limit=100",
        );

        const { sessions, total } = data;

        if (sessions.length === 0) {
          return textContent("No active sessions.");
        }

        const lines: string[] = [];
        lines.push(`ACTIVE SESSIONS (${total})`);
        lines.push("─".repeat(70));

        for (const s of sessions) {
          const fileCount = s.filesJson
            ? (JSON.parse(s.filesJson) as string[]).length
            : 0;
          const project = s.projectSlug ?? "unresolved";
          const started = new Date(s.startedAt).toLocaleTimeString();
          lines.push(
            `${s.id.slice(0, 12)}  ${project}  ${s.source}/${s.tier}  started=${started}  files=${fileCount}`,
          );
        }

        return textContent(lines.join("\n"));
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
