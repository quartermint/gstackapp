/**
 * Post-hoc grounding engine for capture extractions.
 *
 * Inspired by langextract's difflib approach: deterministic alignment
 * of extraction results back to source text, highlighting which words
 * triggered each extraction. No LLM involved — pure string matching.
 *
 * Grounding tiers (cascade):
 *   1. MATCH_EXACT  — exact substring match (case-insensitive)
 *   2. MATCH_LESSER — word-level overlap (>= 60% of extraction words found)
 *   3. MATCH_FUZZY  — fuzzy match via normalized edit distance
 *   4. ungrounded   — no match found (extraction not in source text)
 */

export type GroundingTier = "exact" | "lesser" | "fuzzy";

export interface GroundingSpan {
  start: number;
  end: number;
  text: string;
  tier: GroundingTier;
}

export interface GroundedExtraction {
  extractionType: string;
  content: string;
  confidence: number;
  grounding: GroundingSpan[];
}

export interface ExtractionInput {
  extractionType: string;
  content: string;
  confidence: number;
}

// --- Utility functions ---

/**
 * Normalize text for comparison: lowercase, collapse whitespace.
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Extract words from text (split on whitespace and punctuation).
 */
function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.!?;:'"()\[\]{}\-/]+/)
    .filter((w) => w.length > 0);
}

/**
 * Find all case-insensitive occurrences of a substring in source text.
 * Returns character offset spans.
 */
function findExactMatches(source: string, target: string): GroundingSpan[] {
  const spans: GroundingSpan[] = [];
  const sourceLower = source.toLowerCase();
  const targetLower = target.toLowerCase().trim();

  if (targetLower.length === 0) return spans;

  let startIdx = 0;
  while (true) {
    const idx = sourceLower.indexOf(targetLower, startIdx);
    if (idx === -1) break;
    spans.push({
      start: idx,
      end: idx + targetLower.length,
      text: source.slice(idx, idx + targetLower.length),
      tier: "exact",
    });
    startIdx = idx + 1; // Allow overlapping matches
  }

  return spans;
}

/**
 * Find word-level overlap between extraction and source text.
 * Returns spans for matched words if >= 60% of extraction words are found.
 */
function findLesserMatches(
  source: string,
  extractionContent: string
): GroundingSpan[] {
  const extractionWords = extractWords(extractionContent);
  if (extractionWords.length === 0) return [];

  const sourceLower = source.toLowerCase();
  const matchedSpans: GroundingSpan[] = [];
  let matchedCount = 0;

  for (const word of extractionWords) {
    // Skip very short words (articles, prepositions)
    if (word.length <= 2) continue;

    // Find word boundary matches in source
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "gi");
    let match;
    while ((match = regex.exec(source)) !== null) {
      matchedSpans.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        tier: "lesser",
      });
    }

    if (sourceLower.includes(word)) {
      matchedCount++;
    }
  }

  // Filter out short words from the count
  const significantWords = extractionWords.filter((w) => w.length > 2);
  const threshold = significantWords.length > 0 ? 0.6 : 0;

  if (significantWords.length === 0) return [];
  if (matchedCount / significantWords.length < threshold) return [];

  // Deduplicate overlapping spans
  return deduplicateSpans(matchedSpans);
}

/**
 * Fuzzy match: find the best-matching substring in source.
 * Uses a sliding window approach with character overlap scoring.
 */
function findFuzzyMatch(
  source: string,
  extractionContent: string
): GroundingSpan[] {
  const normalizedExtraction = normalize(extractionContent);
  if (normalizedExtraction.length === 0) return [];

  const normalizedSource = normalize(source);
  const windowSize = Math.min(
    normalizedExtraction.length * 2,
    normalizedSource.length
  );

  if (windowSize === 0) return [];

  let bestScore = 0;
  let bestStart = 0;
  let bestEnd = 0;

  // Slide a window across the source to find best character overlap
  for (
    let i = 0;
    i <= normalizedSource.length - Math.min(normalizedExtraction.length / 2, normalizedSource.length);
    i++
  ) {
    const end = Math.min(i + windowSize, normalizedSource.length);
    const window = normalizedSource.slice(i, end);

    const score = characterOverlapScore(normalizedExtraction, window);
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
      bestEnd = end;
    }
  }

  // Only return fuzzy match if score is above threshold (0.75)
  // High threshold to avoid false positives from shared common English characters
  if (bestScore < 0.75) return [];

  // Map back to original source offsets
  // Since we normalized, offsets are approximate
  const matchedText = source.slice(bestStart, bestEnd).trim();
  if (matchedText.length === 0) return [];

  return [
    {
      start: bestStart,
      end: bestStart + matchedText.length,
      text: matchedText,
      tier: "fuzzy",
    },
  ];
}

/**
 * Calculate character-level overlap score between two strings.
 * Returns value between 0 and 1.
 */
function characterOverlapScore(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;

  const aChars = new Map<string, number>();
  for (const c of a) {
    aChars.set(c, (aChars.get(c) ?? 0) + 1);
  }

  let overlap = 0;
  for (const c of b) {
    const count = aChars.get(c) ?? 0;
    if (count > 0) {
      overlap++;
      aChars.set(c, count - 1);
    }
  }

  return (2 * overlap) / (a.length + b.length);
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove overlapping spans, keeping the longest match at each position.
 */
function deduplicateSpans(spans: GroundingSpan[]): GroundingSpan[] {
  if (spans.length <= 1) return spans;

  // Sort by start position, then by length descending
  const sorted = [...spans].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  const result: GroundingSpan[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = result[result.length - 1]!;

    // Skip if current is fully contained in last
    if (current.start >= last.start && current.end <= last.end) {
      continue;
    }

    // Skip if significant overlap (>50%)
    const overlapStart = Math.max(current.start, last.start);
    const overlapEnd = Math.min(current.end, last.end);
    if (overlapEnd > overlapStart) {
      const overlapLen = overlapEnd - overlapStart;
      const currentLen = current.end - current.start;
      if (overlapLen / currentLen > 0.5) {
        continue;
      }
    }

    result.push(current);
  }

  return result;
}

// --- Main grounding function ---

/**
 * Align extractions back to source text using cascade matching.
 *
 * For each extraction, try:
 * 1. Exact substring match (case-insensitive)
 * 2. Word-level overlap (>= 60% of significant words)
 * 3. Fuzzy character-level match
 * 4. If none match, return empty grounding (ungrounded)
 */
export function alignExtractions(
  sourceText: string,
  extractions: ExtractionInput[]
): GroundedExtraction[] {
  return extractions.map((extraction) => {
    // Try exact match first
    const exactSpans = findExactMatches(sourceText, extraction.content);
    if (exactSpans.length > 0) {
      return {
        ...extraction,
        grounding: exactSpans,
      };
    }

    // Try lesser (word-level) match
    const lesserSpans = findLesserMatches(sourceText, extraction.content);
    if (lesserSpans.length > 0) {
      return {
        ...extraction,
        grounding: lesserSpans,
      };
    }

    // Try fuzzy match
    const fuzzySpans = findFuzzyMatch(sourceText, extraction.content);
    if (fuzzySpans.length > 0) {
      return {
        ...extraction,
        grounding: fuzzySpans,
      };
    }

    // Ungrounded
    return {
      ...extraction,
      grounding: [],
    };
  });
}
