import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchApi } from "../api-client.js";
import { textContent, errorContent } from "../format.js";

interface SearchResult {
  projectSlug: string;
  snippet: string;
  fileSize: number;
  stalenessScore: number;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
}

export function registerCrossProjectSearch(server: McpServer): void {
  server.registerTool(
    "cross_project_search",
    {
      description:
        "Search across all project CLAUDE.md documentation. Returns matching projects with relevant snippets.",
      inputSchema: {
        query: z
          .string()
          .describe("Search term to find across all project knowledge"),
      },
    },
    async ({ query }) => {
      try {
        const data = await fetchApi<SearchResponse>(
          `/api/knowledge/search?q=${encodeURIComponent(query)}`
        );

        if (data.results.length === 0) {
          return textContent(`No results found for '${query}'.`);
        }

        const lines: string[] = [];
        lines.push(`KNOWLEDGE SEARCH: "${query}"`);
        lines.push("\u2500".repeat(50));
        lines.push(`Found ${data.total} match(es)`);
        lines.push("");

        for (const r of data.results) {
          lines.push(
            `[${r.projectSlug}] (staleness: ${r.stalenessScore}/100)`
          );
          lines.push(`  ...${r.snippet}...`);
        }

        return textContent(lines.join("\n"));
      } catch (error) {
        return errorContent(error);
      }
    }
  );
}
