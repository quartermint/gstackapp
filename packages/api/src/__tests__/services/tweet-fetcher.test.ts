import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock link-extractor
vi.mock("../../services/link-extractor.js", () => ({
  extractLinkMetadata: vi.fn(),
}));

// Mock fs.readFileSync for session loading
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from "node:fs";
const mockReadFileSync = vi.mocked(readFileSync);

import { extractLinkMetadata } from "../../services/link-extractor.js";
const mockExtractLinkMetadata = vi.mocked(extractLinkMetadata);

// Import module under test (after mocks)
const {
  fetchTweetContent,
  batchFetchTweets,
  isCrawl4AIAvailable,
  clearSessionCache,
  TWEET_URL_PATTERN,
} = await import("../../services/tweet-fetcher.js");

/** Helper: mock a valid tweety session file */
function mockValidSession() {
  mockReadFileSync.mockReturnValue(
    JSON.stringify({
      cookies: {
        auth_token: "test_auth_token",
        ct0: "test_ct0_token",
        guest_id: "v1%3A12345",
        twid: "u%3A67890",
        personalization_id: "\"v1_test\"",
      },
    })
  );
}

/** Helper: mock the ct0 refresh fetch (hits x.com, returns set-cookie with fresh ct0) */
function mockCt0Refresh() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    headers: {
      getSetCookie: () => ["ct0=fresh_ct0_token; path=/; domain=.x.com"],
    },
  });
}

/** Helper: build a GraphQL TweetDetail response */
function buildTweetDetailResponse(tweetId: string, text: string, screenName: string) {
  return {
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [
          {
            entries: [
              {
                content: {
                  itemContent: {
                    tweet_results: {
                      result: {
                        rest_id: tweetId,
                        legacy: { full_text: text },
                        core: {
                          user_results: {
                            result: {
                              legacy: { screen_name: screenName },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    },
  };
}

describe("Tweet Fetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionCache();
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

  describe("isCrawl4AIAvailable (compat shim)", () => {
    it("returns true when session file exists", async () => {
      mockValidSession();
      const result = await isCrawl4AIAvailable();
      expect(result).toBe(true);
    });

    it("returns false when session file is missing", async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });
      const result = await isCrawl4AIAvailable();
      expect(result).toBe(false);
    });
  });

  describe("fetchTweetContent", () => {
    it("returns content from Twitter GraphQL API", async () => {
      mockValidSession();
      mockCt0Refresh();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildTweetDetailResponse("123", "This is tweet content about coding", "user"),
      });

      const result = await fetchTweetContent("https://x.com/user/status/123");

      expect(result.content).toBe("This is tweet content about coding");
      expect(result.url).toBe("https://x.com/user/status/123");
      expect(result.author).toBe("user");
      expect(result.fetchedVia).toBe("twitter_api");
    });

    it("falls back to OG scraper when GraphQL fails", async () => {
      mockValidSession();
      mockCt0Refresh();
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      mockExtractLinkMetadata.mockResolvedValueOnce({
        title: "Tweet Title",
        description: "OG description of the tweet",
        domain: "x.com",
        image: null,
      });

      const result = await fetchTweetContent("https://x.com/user/status/456");

      expect(result.fetchedVia).toBe("og_scraper");
      expect(result.content).toBe("OG description of the tweet");
    });

    it("falls back to OG scraper when no session file", async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      mockExtractLinkMetadata.mockResolvedValueOnce({
        title: "Tweet",
        description: "Fallback content",
        domain: "x.com",
        image: null,
      });

      const result = await fetchTweetContent("https://x.com/user/status/789");

      expect(result.fetchedVia).toBe("og_scraper");
      expect(result.content).toBe("Fallback content");
    });

    it("returns failed for non-tweet URLs", async () => {
      const result = await fetchTweetContent("https://example.com/page");

      expect(result.fetchedVia).toBe("failed");
      expect(result.content).toBeNull();
    });

    it("extracts author from tweet URL path", async () => {
      mockValidSession();
      mockCt0Refresh();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildTweetDetailResponse("12345", "Some tweet", "elonmusk"),
      });

      const result = await fetchTweetContent(
        "https://twitter.com/elonmusk/status/12345"
      );

      expect(result.author).toBe("elonmusk");
    });

    it("clears session cache on 401 and falls back", async () => {
      mockValidSession();
      mockCt0Refresh();
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

      mockExtractLinkMetadata.mockResolvedValueOnce({
        title: null,
        description: null,
        domain: "x.com",
        image: null,
      });

      const result = await fetchTweetContent("https://x.com/user/status/999");

      expect(["og_scraper", "failed"]).toContain(result.fetchedVia);
    });
  });

  describe("batchFetchTweets", () => {
    it("processes multiple URLs and returns results", async () => {
      mockValidSession();
      // Use mockResolvedValue (not Once) so every fetch call gets a valid response
      // ct0 refresh and GraphQL calls all get this -- GraphQL parse extracts tweet, ct0 refresh harmlessly returns
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { getSetCookie: () => ["ct0=test_ct0; path=/"] },
        json: async () =>
          buildTweetDetailResponse("1", "Tweet content", "user1"),
      });

      const results = await batchFetchTweets([
        "https://x.com/user1/status/1",
        "https://x.com/user2/status/2",
      ]);

      expect(results).toHaveLength(2);
      // First tweet matches the mocked rest_id "1", second doesn't match but still gets fetched
      expect(results[0]!.content).toBe("Tweet content");
      expect(results[0]!.fetchedVia).toBe("twitter_api");
    });

    it("calls onProgress callback", async () => {
      mockValidSession();
      mockCt0Refresh();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () =>
          buildTweetDetailResponse("1", "Content", "u"),
      });

      const progress: Array<{ done: number; total: number }> = [];

      await batchFetchTweets(
        ["https://x.com/u/status/1", "https://x.com/u/status/2"],
        undefined,
        (done, total) => progress.push({ done, total })
      );

      expect(progress.length).toBeGreaterThan(0);
      const last = progress[progress.length - 1]!;
      expect(last.done).toBe(2);
      expect(last.total).toBe(2);
    });

    it("handles failure with OG scraper fallback", async () => {
      mockValidSession();
      // All GraphQL/ct0 calls fail
      mockFetch.mockRejectedValue(new Error("network error"));

      // OG scraper fallback
      mockExtractLinkMetadata.mockResolvedValue({
        title: null,
        description: "OG fallback",
        domain: "x.com",
        image: null,
      });

      const results = await batchFetchTweets([
        "https://x.com/user1/status/1",
      ]);

      expect(results).toHaveLength(1);
      expect(results[0]!.fetchedVia).toBe("og_scraper");
      expect(results[0]!.content).toBe("OG fallback");
    });
  });
});
