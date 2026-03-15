import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchApi } from "../api-client.js";
import { textContent, errorContent } from "../format.js";

const SYNC_CHECK_TYPES = [
  "unpushed_commits",
  "no_remote",
  "broken_tracking",
  "remote_branch_gone",
  "unpulled_commits",
] as const;

interface Finding {
  projectSlug: string;
  checkType: string;
  severity: string;
  detail: string;
}

interface Copy {
  projectSlug: string;
  host: string;
  branch: string;
  headHash: string;
  isStale: boolean;
}

export function registerSyncStatus(server: McpServer): void {
  server.registerTool(
    "sync_status",
    {
      description:
        "Sync report across all projects. Shows unpushed commits, missing remotes, broken tracking, diverged copies, and other sync issues.",
    },
    async () => {
      try {
        const [healthData, copiesData] = await Promise.all([
          fetchApi<{ findings: Finding[]; total: number }>("/api/health-checks"),
          fetchApi<{ copies: Copy[]; total: number }>("/api/copies"),
        ]);

        const syncFindings = healthData.findings.filter((f) =>
          (SYNC_CHECK_TYPES as readonly string[]).includes(f.checkType),
        );

        const staleCopies = copiesData.copies.filter((c) => c.isStale);

        if (syncFindings.length === 0 && staleCopies.length === 0) {
          return textContent("All projects in sync. No sync issues detected.");
        }

        const lines: string[] = [];
        lines.push("SYNC STATUS REPORT");
        lines.push("─".repeat(50));

        if (syncFindings.length > 0) {
          // Group by check type
          const grouped = new Map<string, Finding[]>();
          for (const f of syncFindings) {
            const existing = grouped.get(f.checkType) ?? [];
            existing.push(f);
            grouped.set(f.checkType, existing);
          }

          for (const [checkType, findings] of grouped) {
            lines.push(`\n${checkType.toUpperCase()} (${findings.length}):`);
            for (const f of findings) {
              lines.push(`  [${f.severity}] ${f.projectSlug}: ${f.detail}`);
            }
          }
        }

        if (staleCopies.length > 0) {
          lines.push(`\nSTALE COPIES (${staleCopies.length}):`);
          for (const c of staleCopies) {
            lines.push(`  ${c.projectSlug} on ${c.host}: ${c.branch} @ ${c.headHash} [stale]`);
          }
        }

        return textContent(lines.join("\n"));
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
