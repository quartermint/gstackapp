import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchApi } from "../api-client.js";
import { textContent, errorContent } from "../format.js";

interface KnowledgeResponse {
  projectSlug: string;
  content: string;
  contentHash: string;
  fileSize: number;
  lastModified: string;
  commitsSinceUpdate: number;
  stalenessScore: number;
  lastScannedAt: string;
  createdAt: string;
  updatedAt: string;
}

export function registerProjectKnowledge(server: McpServer): void {
  server.registerTool(
    "project_knowledge",
    {
      description:
        "Get aggregated CLAUDE.md content and metadata for a project. Returns the full documentation, staleness score, file size, and last modified date.",
      inputSchema: {
        slug: z
          .string()
          .describe("Project slug (e.g., mission-control, openefb)"),
      },
    },
    async ({ slug }) => {
      try {
        const data = await fetchApi<KnowledgeResponse>(
          `/api/knowledge/${slug}`
        );

        const lines: string[] = [];
        lines.push(`PROJECT KNOWLEDGE: ${data.projectSlug}`);
        lines.push("\u2500".repeat(50));
        lines.push(`Staleness: ${data.stalenessScore}/100 (100=fresh)`);
        lines.push(`File size: ${data.fileSize} bytes`);
        lines.push(`Last modified: ${data.lastModified}`);
        lines.push(`Commits since update: ${data.commitsSinceUpdate}`);
        lines.push("");
        lines.push("CONTENT:");
        lines.push(data.content);

        return textContent(lines.join("\n"));
      } catch (error) {
        return errorContent(error);
      }
    }
  );
}
