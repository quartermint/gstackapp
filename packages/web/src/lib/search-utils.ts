/**
 * Utility functions for parsing and formatting FTS5 search snippets.
 *
 * FTS5 snippet() returns text with <mark>...</mark> tags around matched terms.
 * These utilities convert that into React-renderable segments and handle truncation.
 */

export interface SnippetSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Parse an FTS5 snippet with <mark>...</mark> tags into segments for React rendering.
 *
 * Example:
 *   parseSnippet("hello <mark>world</mark> foo") =>
 *   [{ text: "hello ", highlighted: false }, { text: "world", highlighted: true }, { text: " foo", highlighted: false }]
 */
export function parseSnippet(snippet: string): SnippetSegment[] {
  const segments: SnippetSegment[] = [];
  const regex = /<mark>(.*?)<\/mark>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(snippet)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      segments.push({
        text: snippet.slice(lastIndex, match.index),
        highlighted: false,
      });
    }
    // Add highlighted match
    segments.push({
      text: match[1] ?? "",
      highlighted: true,
    });
    lastIndex = regex.lastIndex;
  }

  // Add remaining plain text after last match
  if (lastIndex < snippet.length) {
    segments.push({
      text: snippet.slice(lastIndex),
      highlighted: false,
    });
  }

  // If no segments were found (no <mark> tags), return the whole string as plain
  if (segments.length === 0) {
    segments.push({ text: snippet, highlighted: false });
  }

  return segments;
}

/**
 * Truncate a snippet to maxChars while preserving <mark> tag integrity.
 * Adds "..." if truncated.
 *
 * The function counts only visible characters (excluding tags) toward the limit.
 */
export function truncateSnippet(snippet: string, maxChars: number = 120): string {
  // Strip tags to measure visible length
  const visibleText = snippet.replace(/<\/?mark>/g, "");
  if (visibleText.length <= maxChars) {
    return snippet;
  }

  let visibleCount = 0;
  let i = 0;
  let inTag = false;
  let result = "";

  while (i < snippet.length && visibleCount < maxChars) {
    const char = snippet[i];

    // Detect start of <mark> or </mark> tag
    if (char === "<" && (snippet.slice(i, i + 6) === "<mark>" || snippet.slice(i, i + 7) === "</mark>")) {
      inTag = true;
      const tagEnd = snippet.indexOf(">", i);
      if (tagEnd !== -1) {
        result += snippet.slice(i, tagEnd + 1);
        i = tagEnd + 1;
        inTag = false;
        continue;
      }
    }

    if (!inTag) {
      visibleCount++;
    }
    result += char;
    i++;
  }

  // Close any open <mark> tag
  const openMarks = (result.match(/<mark>/g) ?? []).length;
  const closeMarks = (result.match(/<\/mark>/g) ?? []).length;
  if (openMarks > closeMarks) {
    result += "</mark>";
  }

  return result + "...";
}
