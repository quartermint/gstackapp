import { describe, it, expect } from "vitest";
import {
  getContextBudget,
  truncateContext,
  buildNarrativeContext,
} from "../../services/context-adapter.js";

describe("Context adapter", () => {
  describe("getContextBudget", () => {
    it("returns 4096 tokens for small models (<=7B params or unknown)", () => {
      expect(getContextBudget(null)).toBe(4096);
      expect(getContextBudget("some-unknown-model")).toBe(4096);
      expect(getContextBudget("qwen2.5-7b")).toBe(4096);
    });

    it("returns 8192 tokens for medium models (8B-32B)", () => {
      expect(getContextBudget("qwen3-coder-30b")).toBe(8192);
      expect(getContextBudget("Qwen3-Coder-30B-Q4")).toBe(8192);
      expect(getContextBudget("some-32b-model")).toBe(8192);
    });

    it("returns 16384 tokens for large models (>32B)", () => {
      expect(getContextBudget("llama-70b-instruct")).toBe(16384);
      expect(getContextBudget("qwen-72b-chat")).toBe(16384);
    });
  });

  describe("truncateContext", () => {
    it("returns full text when under budget", () => {
      const text = "Line 1\nLine 2\nLine 3";
      const result = truncateContext(text, 100);
      expect(result).toBe(text);
    });

    it("cuts text at token budget preserving complete lines", () => {
      // Budget = 10 tokens => ~40 chars
      // Each line is ~8 chars + newline = ~9 chars
      // With [truncated]\n marker (~12 chars), ~28 chars left => ~3 lines
      const text = "Line 01a\nLine 02b\nLine 03c\nLine 04d\nLine 05e";
      const result = truncateContext(text, 10);

      // Should keep only lines that fit within budget
      expect(result).toContain("[truncated]");
      // Should contain the most recent lines (end of text)
      expect(result).toContain("Line 05e");
      // Should NOT contain the oldest lines
      expect(result).not.toContain("Line 01a");
    });

    it("adds [truncated] marker when truncation occurs", () => {
      const lines = Array.from({ length: 50 }, (_, i) => `Line ${i}: some content here`);
      const text = lines.join("\n");
      const result = truncateContext(text, 20); // ~80 chars
      expect(result).toMatch(/^\[truncated\]/);
    });
  });

  describe("buildNarrativeContext", () => {
    it("assembles commits + captures + sessions into a context string under budget", () => {
      const data = {
        commits: [
          { hash: "abc1234", message: "feat: add auth", date: "2026-03-23" },
          { hash: "def5678", message: "fix: null check", date: "2026-03-22" },
        ],
        captures: [
          { content: "Need to add rate limiting", createdAt: "2026-03-23" },
        ],
        sessions: [
          { id: "sess-1", source: "claude-code", startedAt: "2026-03-23T10:00:00Z" },
        ],
        gitState: "branch: main, clean",
      };

      const result = buildNarrativeContext(data, 1000);

      expect(result).toContain("abc1234");
      expect(result).toContain("feat: add auth");
      expect(result).toContain("rate limiting");
      expect(result).toContain("sess-1");
      expect(result).toContain("branch: main");
    });

    it("truncates oldest items first when over budget", () => {
      // Create many commits to exceed a tiny budget
      const commits = Array.from({ length: 50 }, (_, i) => ({
        hash: `hash${i.toString().padStart(3, "0")}`,
        message: `commit message number ${i} with extra text to fill space`,
        date: `2026-03-${(i + 1).toString().padStart(2, "0")}`,
      }));

      const data = {
        commits,
        captures: [],
        sessions: [],
        gitState: "branch: main",
      };

      const result = buildNarrativeContext(data, 200); // ~800 chars budget for 50 long commits

      // Most recent commits should be present, oldest should be dropped
      expect(result).toContain("hash049"); // most recent
      expect(result).not.toContain("hash000"); // oldest should be truncated
    });

    it("handles empty data gracefully", () => {
      const data = {
        commits: [],
        captures: [],
        sessions: [],
        gitState: "",
      };

      const result = buildNarrativeContext(data, 1000);
      expect(typeof result).toBe("string");
    });
  });
});
