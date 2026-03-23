import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock link-extractor
vi.mock("../../services/link-extractor.js", () => ({
  extractLinkMetadata: vi.fn(),
}));

import { extractLinkMetadata } from "../../services/link-extractor.js";
const mockExtractLinkMetadata = vi.mocked(extractLinkMetadata);

// Import module under test (after mocks)
const {
  fetchTweetContent,
  batchFetchTweets,
  isCrawl4AIAvailable,
  TWEET_URL_PATTERN,
} = await import("../../services/tweet-fetcher.js");

describe("Tweet Fetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("TWEET_URL_PATTERN", () => {
    it("matches twitter.com URLs", () => {
      expect(TWEET_URL_PATTERN.test("https://twitter.com/user/status/123")).toBe(true);
    });

    it("matches x.com URLs", () => {
      expect(TWEET_URL_PATTERN.test("https://x.com/user/status/456")).toBe(true);
    });

    it("does not match other URLs", () => {
      expect(TWEET_URL_PATTERN.test("https://example.com/page")).toBe(false);
    });
  });

  describe("isCrawl4AIAvailable", () => {
    it("returns true when health endpoint responds OK", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await isCrawl4AIAvailable("http://localhost:11235");
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11235/health",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it("returns false when health endpoint fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });
      const result = await isCrawl4AIAvailable("http://localhost:11235");
      expect(result).toBe(false);
    });

    it("returns false on connection error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const result = await isCrawl4AIAvailable("http://localhost:11235");
      expect(result).toBe(false);
    });
  });

  describe("fetchTweetContent", () => {
    it("returns content from Crawl4AI response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              markdown: "This is tweet content from @user about coding",
              success: true,
            },
          ],
        }),
      });

      const result = await fetchTweetContent(
        "https://x.com/user/status/123",
        "http://localhost:11235"
      );

      expect(result.content).toBe("This is tweet content from @user about coding");
      expect(result.url).toBe("https://x.com/user/status/123");
      expect(result.author).toBe("user");
      expect(result.fetchedVia).toBe("crawl4ai");
    });

    it("falls back to OG scraper when Crawl4AI fails", async () => {
      // Crawl4AI fetch fails
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      // OG scraper fallback
      mockExtractLinkMetadata.mockResolvedValueOnce({
        title: "Tweet Title",
        description: "OG description of the tweet",
        domain: "x.com",
        image: null,
      });

      const result = await fetchTweetContent(
        "https://x.com/user/status/456",
        "http://localhost:11235"
      );

      expect(result.fetchedVia).toBe("og_scraper");
      expect(result.content).toBe("OG description of the tweet");
    });

    it("returns failed for non-tweet URLs", async () => {
      const result = await fetchTweetContent(
        "https://example.com/page",
        "http://localhost:11235"
      );

      expect(result.fetchedVia).toBe("failed");
      expect(result.content).toBeNull();
    });

    it("extracts author from tweet URL path", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              markdown: "Some tweet content",
              success: true,
            },
          ],
        }),
      });

      const result = await fetchTweetContent(
        "https://twitter.com/elonmusk/status/12345",
        "http://localhost:11235"
      );

      expect(result.author).toBe("elonmusk");
    });

    it("handles Crawl4AI returning no content gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              markdown: "",
              success: false,
            },
          ],
        }),
      });

      // OG scraper fallback
      mockExtractLinkMetadata.mockResolvedValueOnce({
        title: null,
        description: null,
        domain: "x.com",
        image: null,
      });

      const result = await fetchTweetContent(
        "https://x.com/user/status/789",
        "http://localhost:11235"
      );

      // Should fall back to OG scraper or return failed
      expect(["og_scraper", "failed"]).toContain(result.fetchedVia);
    });
  });

  describe("batchFetchTweets", () => {
    it("processes multiple URLs and returns results", async () => {
      // Mock successful Crawl4AI responses for each URL
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ markdown: "Tweet 1 content", success: true }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ markdown: "Tweet 2 content", success: true }],
          }),
        });

      const results = await batchFetchTweets(
        [
          "https://x.com/user1/status/1",
          "https://x.com/user2/status/2",
        ],
        "http://localhost:11235"
      );

      expect(results).toHaveLength(2);
      expect(results[0]!.content).toBe("Tweet 1 content");
      expect(results[1]!.content).toBe("Tweet 2 content");
    });

    it("calls onProgress callback", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ markdown: "Content", success: true }],
        }),
      });

      const progress: Array<{ done: number; total: number }> = [];

      await batchFetchTweets(
        ["https://x.com/u/status/1", "https://x.com/u/status/2"],
        "http://localhost:11235",
        (done, total) => progress.push({ done, total })
      );

      expect(progress.length).toBeGreaterThan(0);
      // Last progress call should show all done
      const last = progress[progress.length - 1]!;
      expect(last.done).toBe(2);
      expect(last.total).toBe(2);
    });

    it("handles mixed success and failure results", async () => {
      // First URL succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ markdown: "Success content", success: true }],
        }),
      });

      // Second URL fails at Crawl4AI
      mockFetch.mockRejectedValueOnce(new Error("timeout"));

      // OG scraper fallback for second URL
      mockExtractLinkMetadata.mockResolvedValueOnce({
        title: null,
        description: "OG fallback",
        domain: "x.com",
        image: null,
      });

      const results = await batchFetchTweets(
        [
          "https://x.com/user1/status/1",
          "https://x.com/user2/status/2",
        ],
        "http://localhost:11235"
      );

      expect(results).toHaveLength(2);
      expect(results[0]!.fetchedVia).toBe("crawl4ai");
      expect(results[1]!.fetchedVia).toBe("og_scraper");
    });
  });
});
