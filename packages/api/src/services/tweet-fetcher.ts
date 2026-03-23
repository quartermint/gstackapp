import pLimit from "p-limit";
import { eventBus } from "./event-bus.js";
import { extractLinkMetadata } from "./link-extractor.js";

// ── Constants ───────────────────────────────────────────────────────

const CRAWL4AI_URL = "http://100.123.8.125:11235";

/**
 * Pattern matching tweet URLs from twitter.com and x.com.
 */
export const TWEET_URL_PATTERN = /^https?:\/\/(twitter\.com|x\.com)\//;

// ── Types ───────────────────────────────────────────────────────────

export interface TweetContent {
  url: string;
  content: string | null;
  author: string | null;
  threadContext: string | null;
  fetchedVia: "crawl4ai" | "og_scraper" | "failed";
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract author handle from a tweet URL path.
 * e.g. "https://x.com/elonmusk/status/12345" -> "elonmusk"
 */
function extractAuthorFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    // Pattern: /{handle}/status/{id}
    const match = pathname.match(/^\/([^/]+)\/status\//);
    return match ? match[1] ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Delay helper for rate limiting between requests.
 */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Core Functions ──────────────────────────────────────────────────

/**
 * Check if Crawl4AI service is reachable.
 */
export async function isCrawl4AIAvailable(
  baseUrl: string = CRAWL4AI_URL
): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch tweet content via Crawl4AI with OG scraper fallback.
 *
 * Crawl4AI is preferred because it renders JavaScript and extracts
 * full tweet text including thread context. The OG scraper fallback
 * captures at minimum the og:description which usually contains
 * the tweet text.
 */
export async function fetchTweetContent(
  url: string,
  crawl4aiUrl: string = CRAWL4AI_URL
): Promise<TweetContent> {
  // Reject non-tweet URLs immediately
  if (!TWEET_URL_PATTERN.test(url)) {
    return {
      url,
      content: null,
      author: null,
      threadContext: null,
      fetchedVia: "failed",
    };
  }

  const author = extractAuthorFromUrl(url);

  // Try Crawl4AI first
  try {
    const response = await fetch(`${crawl4aiUrl}/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: [url],
        word_count_threshold: 10,
        extraction_strategy: { type: "NoExtractionStrategy" },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        results?: Array<{
          markdown?: string;
          success?: boolean;
        }>;
      };

      const result = data.results?.[0];
      if (result?.success && result.markdown) {
        return {
          url,
          content: result.markdown,
          author,
          threadContext: null,
          fetchedVia: "crawl4ai",
        };
      }
    }
  } catch {
    // Crawl4AI unavailable or errored -- fall through to OG scraper
  }

  // Fallback to OG scraper (existing link-extractor)
  try {
    const metadata = await extractLinkMetadata(url);
    return {
      url,
      content: metadata.description,
      author,
      threadContext: null,
      fetchedVia: "og_scraper",
    };
  } catch {
    // Total failure
    return {
      url,
      content: null,
      author,
      threadContext: null,
      fetchedVia: "failed",
    };
  }
}

/**
 * Batch fetch tweet content with concurrency limiting and rate-limit backoff.
 *
 * Uses p-limit with concurrency of 2 and 1-second delay between requests
 * to respect rate limits (per pitfall 4 from research).
 */
export async function batchFetchTweets(
  urls: string[],
  crawl4aiUrl: string = CRAWL4AI_URL,
  onProgress?: (done: number, total: number) => void
): Promise<TweetContent[]> {
  const limit = pLimit(2);
  const results: TweetContent[] = [];
  let done = 0;

  const tasks = urls.map((url) =>
    limit(async () => {
      // Rate limiting: 1-second delay between requests
      if (done > 0) {
        await delay(1000);
      }

      const result = await fetchTweetContent(url, crawl4aiUrl);
      results.push(result);
      done++;

      // Report progress
      if (onProgress) {
        onProgress(done, urls.length);
      }

      eventBus.emit("mc:event", {
        type: "capture:created",
        id: "tweet-fetch-progress",
        data: {
          subtype: "tweet-fetch:progress",
          done,
          total: urls.length,
        },
      });

      return result;
    })
  );

  await Promise.all(tasks);

  return results;
}
