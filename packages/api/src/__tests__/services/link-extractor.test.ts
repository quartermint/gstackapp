import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock open-graph-scraper before importing module under test
vi.mock("open-graph-scraper", () => ({
  default: vi.fn(),
}));

import { extractUrls, containsUrl, extractLinkMetadata } from "../../services/link-extractor.js";
import ogs from "open-graph-scraper";

const mockOgs = vi.mocked(ogs);

describe("Link Extractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractUrls", () => {
    it("extracts multiple URLs from content", () => {
      const urls = extractUrls("Check https://example.com and https://foo.bar");
      expect(urls).toEqual(["https://example.com", "https://foo.bar"]);
    });

    it("extracts HTTP URLs", () => {
      const urls = extractUrls("Visit http://legacy-site.com for more");
      expect(urls).toEqual(["http://legacy-site.com"]);
    });

    it("returns empty array when no URLs found", () => {
      const urls = extractUrls("no urls here at all");
      expect(urls).toEqual([]);
    });

    it("handles URLs with paths and query params", () => {
      const urls = extractUrls("See https://example.com/path?foo=bar&baz=1");
      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain("https://example.com/path");
    });
  });

  describe("containsUrl", () => {
    it("returns true when URL is present", () => {
      expect(containsUrl("check https://example.com")).toBe(true);
    });

    it("returns false when no URL is present", () => {
      expect(containsUrl("no urls here")).toBe(false);
    });
  });

  describe("extractLinkMetadata", () => {
    it("returns title, description, domain, and image from OG data", async () => {
      mockOgs.mockResolvedValueOnce({
        result: {
          ogTitle: "Example Page",
          ogDescription: "A great description",
          ogImage: [{ url: "https://example.com/image.png" }],
        },
        error: false,
      } as never);

      const metadata = await extractLinkMetadata("https://example.com/page");

      expect(metadata).toEqual({
        title: "Example Page",
        description: "A great description",
        domain: "example.com",
        image: "https://example.com/image.png",
      });
    });

    it("returns graceful fallback when OG scraping fails", async () => {
      mockOgs.mockRejectedValueOnce(new Error("Timeout"));

      const metadata = await extractLinkMetadata("https://unreachable.com/page");

      expect(metadata).toEqual({
        title: null,
        description: null,
        domain: "unreachable.com",
        image: null,
      });
    });

    it("returns null for missing OG fields", async () => {
      mockOgs.mockResolvedValueOnce({
        result: {},
        error: false,
      } as never);

      const metadata = await extractLinkMetadata("https://minimal.com");

      expect(metadata.title).toBeNull();
      expect(metadata.description).toBeNull();
      expect(metadata.domain).toBe("minimal.com");
      expect(metadata.image).toBeNull();
    });
  });
});
