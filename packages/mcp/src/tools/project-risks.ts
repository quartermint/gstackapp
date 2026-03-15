import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchApi } from "../api-client.js";
import { textContent, errorContent } from "../format.js";

interface Finding {
  projectSlug: string;
  checkType: string;
  severity: string;
  detail: string;
  metadata?: Record<string, unknown>;
  detectedAt?: string;
  isNew?: boolean;
}

interface RisksResponse {
  critical: Finding[];
  warning: Finding[];
  riskCount: number;
  summary: string;
}

export function registerProjectRisks(server: McpServer): void {
  server.registerTool(
    "project_risks",
    {
      description:
        "Active problems across all projects. Returns critical and warning findings with project names, check types, and details. Use severity filter to focus on critical-only or warnings-only.",
      inputSchema: {
        severity: z
          .enum(["critical", "warning"])
          .optional()
          .describe("Filter by severity level. Omit for all."),
      },
    },
    async ({ severity }) => {
      try {
        const data = await fetchApi<RisksResponse>("/api/risks");

        if (data.riskCount === 0) {
          return textContent("No active risks. All projects healthy.");
        }

        const lines: string[] = [];
        lines.push(`RISKS: ${data.summary}`);
        lines.push("─".repeat(50));

        if (!severity || severity === "critical") {
          if (data.critical.length > 0) {
            lines.push(`\nCRITICAL (${data.critical.length}):`);
            for (const f of data.critical) {
              lines.push(`  ${f.projectSlug}: ${f.checkType} — ${f.detail}`);
            }
          }
        }

        if (!severity || severity === "warning") {
          if (data.warning.length > 0) {
            lines.push(`\nWARNING (${data.warning.length}):`);
            for (const f of data.warning) {
              lines.push(`  ${f.projectSlug}: ${f.checkType} — ${f.detail}`);
            }
          }
        }

        return textContent(lines.join("\n"));
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
