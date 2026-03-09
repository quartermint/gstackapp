import type Database from "better-sqlite3";

export interface SearchResult {
  id: string;
  rawContent: string;
  type: string;
  projectId: string | null;
  rank: number;
  createdAt: number;
}

/**
 * Sanitize FTS5 query input to prevent injection.
 * Strips special FTS5 operators and wraps individual terms
 * in double quotes for safe matching.
 */
function sanitizeFtsQuery(query: string): string {
  // Remove FTS5 special operators and syntax
  const cleaned = query
    .replace(/['"]/g, "") // Remove quotes
    .replace(/\b(AND|OR|NOT|NEAR)\b/gi, "") // Remove boolean operators
    .replace(/[{}()*^~]/g, "") // Remove special FTS5 chars
    .trim();

  if (!cleaned) {
    return '""';
  }

  // Split into terms and wrap each in double quotes for safe matching
  const terms = cleaned
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t}"`);

  return terms.join(" ");
}

/**
 * Full-text search across captures using FTS5 with BM25 ranking.
 * Uses the raw SQLite instance for FTS5 queries since Drizzle
 * doesn't have native virtual table support.
 */
export function searchCaptures(
  sqlite: Database.Database,
  query: string,
  limit = 20
): SearchResult[] {
  const sanitized = sanitizeFtsQuery(query);

  const stmt = sqlite.prepare(`
    SELECT
      c.id,
      c.raw_content AS rawContent,
      c.type,
      c.project_id AS projectId,
      c.created_at AS createdAt,
      bm25(captures_fts, 1.0) AS rank
    FROM captures_fts
    JOIN captures c ON captures_fts.rowid = c.rowid
    WHERE captures_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  return stmt.all(sanitized, limit) as SearchResult[];
}
