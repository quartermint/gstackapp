import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchApi } from "../api-client.js";
import { textContent, errorContent } from "../format.js";

interface ConflictItem {
  projectSlug: string;
  sessionA: string;
  sessionB: string;
  files: string[];
  severity: string;
  detectedAt: string;
}

export function registerSessionConflicts(server: McpServer): void {
  server.registerTool(
    "session_conflicts",
    {
      description:
        "Active file-level conflicts across coding sessions. Shows which files are being edited in parallel by different sessions.",
    },
    async () => {
      try {
        const data = await fetchApi<{
          conflicts: ConflictItem[];
          total: number;
        }>("/api/sessions/conflicts");

        const { conflicts } = data;

        if (conflicts.length === 0) {
          return textContent("No active file conflicts across sessions.");
        }

        const lines: string[] = [];
        lines.push(`FILE CONFLICTS (${conflicts.length})`);
        lines.push("─".repeat(70));

        for (const c of conflicts) {
          lines.push(`\n${c.projectSlug}:`);
          lines.push(
            `  Sessions: ${c.sessionA.slice(0, 12)} vs ${c.sessionB.slice(0, 12)}`,
          );
          lines.push(`  Severity: ${c.severity}`);
          lines.push(`  Files (${c.files.length}):`);
          for (const f of c.files.slice(0, 10)) {
            lines.push(`    - ${f}`);
          }
          if (c.files.length > 10) {
            lines.push(`    ... and ${c.files.length - 10} more`);
          }
        }

        return textContent(lines.join("\n"));
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
