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

interface UnifiedSearchResult {
  content: string;
  snippet: string;
  sourceType: string;
  sourceId: string;
  projectSlug: string | null;
  createdAt: string;
}

interface UnifiedSearchResponse {
  results: UnifiedSearchResult[];
  searchMode: string;
}

export function registerCrossProjectSearch(server: McpServer): void {
  server.registerTool(
    "cross_project_search",
    {
      description:
        "Search across all project CLAUDE.md documentation and accepted solutions. Returns matching projects with relevant snippets and solution learnings.",
      inputSchema: {
        query: z
          .string()
          .describe("Search term to find across all project knowledge and solutions"),
      },
    },
    async ({ query }) => {
      try {
        // Parallel fetch: knowledge search + unified search (filter solutions client-side)
        const [knowledgeData, unifiedData] = await Promise.all([
          fetchApi<SearchResponse>(
            `/api/knowledge/search?q=${encodeURIComponent(query)}`
          ),
          fetchApi<UnifiedSearchResponse>(
            `/api/search?q=${encodeURIComponent(query)}&limit=20`
          ).catch(() => ({ results: [] as UnifiedSearchResult[], searchMode: "bm25-only" })),
        ]);

        // Filter solution results from unified search
        const solutionResults = unifiedData.results
          .filter((r) => r.sourceType === "solution")
          .slice(0, 5);

        const hasKnowledge = knowledgeData.results.length > 0;
        const hasSolutions = solutionResults.length > 0;

        if (!hasKnowledge && !hasSolutions) {
          return textContent(`No results found for '${query}'.`);
        }

        const lines: string[] = [];

        // Knowledge section
        if (hasKnowledge) {
          lines.push(`KNOWLEDGE SEARCH: "${query}"`);
          lines.push("\u2500".repeat(50));
          lines.push(`Found ${knowledgeData.total} match(es)`);
          lines.push("");

          for (const r of knowledgeData.results) {
            lines.push(
              `[${r.projectSlug}] (staleness: ${r.stalenessScore}/100)`
            );
            lines.push(`  ...${r.snippet}...`);
          }
        }

        // Solutions section
        if (hasSolutions) {
          if (hasKnowledge) lines.push("");
          lines.push(`SOLUTIONS:`);
          lines.push("\u2500".repeat(50));
          lines.push(`Found ${solutionResults.length} solution(s)`);
          lines.push("");

          for (const r of solutionResults) {
            const slug = r.projectSlug ?? "global";
            lines.push(`[${slug}] ${r.snippet.slice(0, 100)}`);
            if (r.content && r.content.length > 100) {
              lines.push(`  ...${r.content.slice(0, 200)}...`);
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
