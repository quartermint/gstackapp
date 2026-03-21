import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchApi } from "../api-client.js";
import { textContent, errorContent } from "../format.js";

interface Finding {
  projectSlug: string;
  checkType: string;
  severity: string;
  detail: string;
  metadata?: {
    violations?: Array<{ ruleId: string; description: string }>;
  };
}

interface HealthChecksResponse {
  findings: Finding[];
  riskLevel: string;
}

export function registerConventionCheck(server: McpServer): void {
  server.registerTool(
    "convention_check",
    {
      description:
        "Check convention compliance for a project. Returns any active convention violations detected in the project's CLAUDE.md file.",
      inputSchema: {
        slug: z
          .string()
          .describe("Project slug (e.g., mission-control, openefb)"),
      },
    },
    async ({ slug }) => {
      try {
        const data = await fetchApi<HealthChecksResponse>(
          `/api/health-checks/${slug}`
        );

        const violations = data.findings.filter(
          (f) => f.checkType === "convention_violation"
        );

        if (violations.length === 0) {
          return textContent(
            `No convention violations found for ${slug}.`
          );
        }

        const lines: string[] = [];
        lines.push(`CONVENTION CHECK: ${slug}`);
        lines.push("\u2500".repeat(50));
        lines.push(`Violations: ${violations.length}`);
        lines.push("");

        for (const v of violations) {
          lines.push(`[${v.severity}] ${v.detail}`);
          if (v.metadata?.violations) {
            for (const sub of v.metadata.violations) {
              lines.push(`  - ${sub.ruleId}: ${sub.description}`);
            }
          }
        }

        return textContent(lines.join("\n"));
      } catch (error) {
        return errorContent(error);
      }
    }
  );
}
