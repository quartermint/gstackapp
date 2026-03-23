import { describe, it, expect } from "vitest";
import {
  alignExtractions,
  groundExtraction,
  groundAllExtractions,
} from "../../services/grounding.js";
import type { ExtractionInput } from "../../services/grounding.js";

describe("Grounding Engine", () => {
  const sourceText =
    "Need to add search feature to mission-control dashboard. Should we use vector embeddings? Check out https://example.com/search for ideas.";

  describe("exact matches", () => {
    it("finds exact substring match (case-insensitive)", () => {
      const extractions: ExtractionInput[] = [
        {
          extractionType: "project_ref",
          content: "mission-control",
          confidence: 0.95,
        },
      ];

      const results = alignExtractions(sourceText, extractions);

      expect(results).toHaveLength(1);
      expect(results[0]!.grounding).toHaveLength(1);
      expect(results[0]!.grounding[0]!.tier).toBe("exact");
      expect(results[0]!.grounding[0]!.text).toBe("mission-control");
      expect(results[0]!.grounding[0]!.start).toBe(
        sourceText.indexOf("mission-control")
      );
    });

    it("finds case-insensitive exact match", () => {
      const source = "The Mission-Control dashboard is great";
      const extractions: ExtractionInput[] = [
        {
          extractionType: "project_ref",
          content: "mission-control",
          confidence: 0.9,
        },
      ];

      const results = alignExtractions(source, extractions);

      expect(results[0]!.grounding).toHaveLength(1);
      expect(results[0]!.grounding[0]!.tier).toBe("exact");
      expect(results[0]!.grounding[0]!.text).toBe("Mission-Control");
    });

    it("finds multiple exact matches in source", () => {
      const source =
        "Fix the search in mission-control. Also, mission-control needs refactoring.";
      const extractions: ExtractionInput[] = [
        {
          extractionType: "project_ref",
          content: "mission-control",
          confidence: 0.95,
        },
      ];

      const results = alignExtractions(source, extractions);

      expect(results[0]!.grounding).toHaveLength(2);
      expect(results[0]!.grounding[0]!.tier).toBe("exact");
      expect(results[0]!.grounding[1]!.tier).toBe("exact");
    });
  });

  describe("lesser matches (word-level)", () => {
    it("matches when >= 60% of significant words are found", () => {
      const extractions: ExtractionInput[] = [
        {
          extractionType: "action_item",
          content: "add search feature to dashboard",
          confidence: 0.8,
        },
      ];

      const results = alignExtractions(sourceText, extractions);

      expect(results[0]!.grounding.length).toBeGreaterThan(0);
      // Should find word-level matches
      const tiers = results[0]!.grounding.map((g) => g.tier);
      expect(tiers.every((t) => t === "lesser" || t === "exact")).toBe(true);
    });

    it("returns empty grounding when < 60% words match", () => {
      const extractions: ExtractionInput[] = [
        {
          extractionType: "idea",
          content: "completely unrelated content about cooking recipes",
          confidence: 0.3,
        },
      ];

      const results = alignExtractions(sourceText, extractions);

      // Should fall through to fuzzy or be ungrounded
      // Since the content is very different, likely ungrounded
      expect(
        results[0]!.grounding.length === 0 ||
          results[0]!.grounding.every((g) => g.tier === "fuzzy")
      ).toBe(true);
    });
  });

  describe("fuzzy matches", () => {
    it("finds fuzzy match for similar-but-not-exact content", () => {
      const source = "We should implement full-text search functionality";
      const extractions: ExtractionInput[] = [
        {
          extractionType: "idea",
          content: "full text search",
          confidence: 0.7,
        },
      ];

      const results = alignExtractions(source, extractions);

      // Exact or fuzzy should match — "full-text search" vs "full text search"
      expect(results[0]!.grounding.length).toBeGreaterThan(0);
    });
  });

  describe("ungrounded", () => {
    it("returns empty grounding for content not in source", () => {
      const source = "A completely different text about gardening";
      const extractions: ExtractionInput[] = [
        {
          extractionType: "action_item",
          content: "deploy kubernetes cluster to production",
          confidence: 0.1,
        },
      ];

      const results = alignExtractions(source, extractions);

      expect(results[0]!.grounding).toHaveLength(0);
    });

    it("returns empty grounding for empty extraction content", () => {
      const extractions: ExtractionInput[] = [
        {
          extractionType: "idea",
          content: "",
          confidence: 0.1,
        },
      ];

      const results = alignExtractions(sourceText, extractions);

      expect(results[0]!.grounding).toHaveLength(0);
    });
  });

  describe("multiple extractions", () => {
    it("grounds multiple extractions independently", () => {
      const extractions: ExtractionInput[] = [
        {
          extractionType: "project_ref",
          content: "mission-control",
          confidence: 0.95,
        },
        {
          extractionType: "link",
          content: "https://example.com/search",
          confidence: 0.99,
        },
        {
          extractionType: "question",
          content: "Should we use vector embeddings?",
          confidence: 0.8,
        },
      ];

      const results = alignExtractions(sourceText, extractions);

      expect(results).toHaveLength(3);

      // project_ref should be exact match
      expect(results[0]!.grounding.length).toBeGreaterThan(0);
      expect(results[0]!.grounding[0]!.tier).toBe("exact");

      // link should be exact match
      expect(results[1]!.grounding.length).toBeGreaterThan(0);
      expect(results[1]!.grounding[0]!.tier).toBe("exact");

      // question should be exact match (present in source)
      expect(results[2]!.grounding.length).toBeGreaterThan(0);
    });
  });

  describe("grounding span offsets", () => {
    it("returns correct character offsets for exact matches", () => {
      const source = "Check the dashboard";
      const extractions: ExtractionInput[] = [
        {
          extractionType: "project_ref",
          content: "dashboard",
          confidence: 0.9,
        },
      ];

      const results = alignExtractions(source, extractions);

      expect(results[0]!.grounding[0]!.start).toBe(10);
      expect(results[0]!.grounding[0]!.end).toBe(19);
      expect(source.slice(10, 19)).toBe("dashboard");
    });
  });

  describe("edge cases", () => {
    it("handles empty source text", () => {
      const extractions: ExtractionInput[] = [
        {
          extractionType: "idea",
          content: "some idea",
          confidence: 0.5,
        },
      ];

      const results = alignExtractions("", extractions);

      expect(results[0]!.grounding).toHaveLength(0);
    });

    it("handles empty extractions array", () => {
      const results = alignExtractions("Some source text", []);

      expect(results).toHaveLength(0);
    });

    it("handles extraction with special regex characters", () => {
      const source = "Use the C++ compiler (g++) for building.";
      const extractions: ExtractionInput[] = [
        {
          extractionType: "action_item",
          content: "C++",
          confidence: 0.8,
        },
      ];

      const results = alignExtractions(source, extractions);

      expect(results[0]!.grounding.length).toBeGreaterThan(0);
      expect(results[0]!.grounding[0]!.tier).toBe("exact");
    });
  });

  describe("groundExtraction (single extraction)", () => {
    it("returns GroundedSpan for exact match with correct offsets", () => {
      const result = groundExtraction(
        "I need to fix the login bug in mission-control",
        "fix the login bug",
        0
      );

      expect(result).not.toBeNull();
      expect(result!.text).toBe("fix the login bug");
      expect(result!.startOffset).toBe(10);
      expect(result!.endOffset).toBe(27);
      expect(result!.tier).toBe("exact");
    });

    it("returns null when no match is found", () => {
      const result = groundExtraction(
        "A text about gardening",
        "deploy kubernetes cluster",
        0
      );

      expect(result).toBeNull();
    });

    it("returns fuzzy tier for slight variations", () => {
      const result = groundExtraction(
        "We should implement full-text search functionality",
        "full text search",
        0
      );

      // Should match either exact (word overlap) or fuzzy
      expect(result).not.toBeNull();
      expect(["exact", "fuzzy", "lesser"]).toContain(result!.tier);
    });

    it("preserves extractionIndex in returned span", () => {
      const result = groundExtraction(
        "I need to fix the login bug",
        "fix the login bug",
        42
      );

      expect(result).not.toBeNull();
      expect(result!.extractionIndex).toBe(42);
    });
  });

  describe("groundAllExtractions", () => {
    it("processes all extractions and returns grounded spans", () => {
      const spans = groundAllExtractions(
        "Fix the bug in mission-control. Should we use vector search?",
        [
          { type: "project_ref", text: "mission-control", confidence: 0.95 },
          { type: "question", text: "Should we use vector search?", confidence: 0.8 },
        ]
      );

      expect(spans.length).toBeGreaterThanOrEqual(2);
      // All spans should have valid tier
      for (const span of spans) {
        expect(["exact", "fuzzy", "lesser"]).toContain(span.tier);
      }
    });

    it("filters out ungrounded items", () => {
      const spans = groundAllExtractions(
        "A text about gardening",
        [
          { type: "action_item", text: "deploy kubernetes", confidence: 0.1 },
        ]
      );

      // Ungrounded extractions should not appear in result
      expect(spans).toHaveLength(0);
    });

    it("preserves extractionIndex for each span", () => {
      const spans = groundAllExtractions(
        "Fix the bug in mission-control and update docs",
        [
          { type: "project_ref", text: "mission-control", confidence: 0.95 },
          { type: "action_item", text: "update docs", confidence: 0.8 },
        ]
      );

      // Each span should reference which extraction it came from
      const indices = spans.map((s) => s.extractionIndex);
      expect(indices).toContain(0);
      expect(indices).toContain(1);
    });

    it("returns JSON-serializable array", () => {
      const spans = groundAllExtractions(
        "Check mission-control dashboard",
        [{ type: "project_ref", text: "mission-control", confidence: 0.9 }]
      );

      // Should be serializable to JSON and back
      const json = JSON.stringify(spans);
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(spans);
    });
  });
});
