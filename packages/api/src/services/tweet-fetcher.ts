import pLimit from "p-limit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { eventBus } from "./event-bus.js";
import { extractLinkMetadata } from "./link-extractor.js";

// ── Constants ───────────────────────────────────────────────────────

/**
 * Pattern matching tweet URLs from twitter.com and x.com.
 */
export const TWEET_URL_PATTERN = /^https?:\/\/(twitter\.com|x\.com)\//;

/** Extract tweet ID from URL path: /{handle}/status/{id} */
const TWEET_ID_PATTERN = /\/status\/(\d+)/;

/** Twitter's public bearer token (embedded in every web client). */
const TWITTER_BEARER_TOKEN =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

/** GraphQL TweetDetail endpoint (same as tweety library). */
const TWEET_DETAIL_URL =
  "https://x.com/i/api/graphql/DtJcRkV3uP8nQy_0eX8MWA/TweetDetail";

/** Path to tweety session file from ticker project. */
const TWEETY_SESSION_PATH = join(
  homedir(),
  "ticker",
  "scraper",
  "sessions",
  "qmxai2stay.tw_session"
);

// ── Types ───────────────────────────────────────────────────────────

export interface TweetContent {
  url: string;
  content: string | null;
  author: string | null;
  threadContext: string | null;
  fetchedVia: "twitter_api" | "og_scraper" | "failed";
}

interface TwitterSession {
  cookies: Record<string, string>;
  ct0: string;
}

// ── Session Loading ─────────────────────────────────────────────────

let cachedSession: TwitterSession | null = null;

/**
 * Load auth_token and ct0 from the tweety session file.
 * Caches in memory after first read.
 */
function loadTwitterSession(): TwitterSession | null {
  if (cachedSession) return cachedSession;

  try {
    const raw = readFileSync(TWEETY_SESSION_PATH, "utf-8");
    const data = JSON.parse(raw) as { cookies?: Record<string, string> };
    const cookies = data.cookies as Record<string, string> | undefined;
    if (cookies?.["auth_token"] && cookies?.["ct0"]) {
      cachedSession = { cookies, ct0: cookies["ct0"] };
      return cachedSession;
    }
  } catch {
    // Session file missing or malformed
  }
  return null;
}

/** Clear cached session (e.g., after auth failure or in tests). */
export function clearSessionCache(): void {
  cachedSession = null;
  cachedFreshCt0 = null;
  ct0RefreshedAt = 0;
}

// ── ct0 Refresh ─────────────────────────────────────────────────────

let cachedFreshCt0: string | null = null;
let ct0RefreshedAt = 0;
const CT0_TTL_MS = 5 * 60 * 1000; // Refresh ct0 every 5 minutes

/**
 * Get a fresh ct0 CSRF token by hitting x.com with the auth_token cookie.
 * Twitter's GraphQL API rejects stale ct0 tokens from session files.
 */
async function getFreshCt0(authToken: string): Promise<string | null> {
  const now = Date.now();
  if (cachedFreshCt0 && now - ct0RefreshedAt < CT0_TTL_MS) {
    return cachedFreshCt0;
  }

  try {
    const response = await fetch("https://x.com", {
      headers: { cookie: `auth_token=${authToken}` },
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });

    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const c of setCookies) {
      if (c.startsWith("ct0=")) {
        cachedFreshCt0 = c.split("=")[1]!.split(";")[0]!;
        ct0RefreshedAt = now;
        return cachedFreshCt0;
      }
    }
  } catch {
    // Failed to refresh -- fall back to session file ct0
  }
  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract author handle from a tweet URL path.
 * e.g. "https://x.com/elonmusk/status/12345" -> "elonmusk"
 */
function extractAuthorFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/^\/([^/]+)\/status\//);
    return match ? match[1] ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Extract tweet ID from a tweet URL.
 * e.g. "https://x.com/user/status/12345?s=20" -> "12345"
 */
function extractTweetId(url: string): string | null {
  const match = url.match(TWEET_ID_PATTERN);
  return match ? match[1] ?? null : null;
}

/**
 * Delay helper for rate limiting between requests.
 */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── GraphQL Tweet Fetch ─────────────────────────────────────────────

/** Features object matching tweety's TweetDetail request. */
const TWEET_DETAIL_FEATURES = {
  rweb_video_screen_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: true,
  premium_content_api_read_enabled: true,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: true,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  creator_subscriptions_quote_tweet_preview_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_enhance_cards_enabled: true,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Extract tweet text from the GraphQL TweetDetail response.
 * Navigates the nested timeline instruction entries to find the focal tweet.
 */
function extractTweetText(
  data: any,
  tweetId: string
): { text: string; author: string | null } | null {
  try {
    const instructions =
      data?.data?.threaded_conversation_with_injections_v2?.instructions;

    if (!Array.isArray(instructions)) return null;

    for (const instruction of instructions) {
      const entries = instruction.entries;
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        const result = entry?.content?.itemContent?.tweet_results?.result;
        if (!result) continue;

        // Handle tweets wrapped in a "tweet" key (e.g., limited visibility)
        const tweetData = result.tweet ?? result;

        const legacy = tweetData.legacy;
        const restId = tweetData.rest_id as string | undefined;

        if (restId === tweetId && legacy) {
          const fullText = legacy.full_text as string | undefined;
          const screenName =
            tweetData?.core?.user_results?.result?.legacy?.screen_name as
              | string
              | undefined;

          if (fullText) {
            return { text: fullText, author: screenName ?? null };
          }
        }
      }
    }
  } catch {
    // Malformed response
  }
  return null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Fetch a single tweet via Twitter's GraphQL TweetDetail API.
 * Uses auth_token + ct0 cookies from the shared tweety session.
 */
async function fetchViaGraphQL(
  tweetId: string,
  session: TwitterSession
): Promise<{ text: string; author: string | null } | null> {
  const variables = JSON.stringify({
    focalTweetId: tweetId,
    with_rux_injections: true,
    rankingMode: "Relevance",
    includePromotedContent: true,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: true,
    withVoice: true,
  });

  const features = JSON.stringify(TWEET_DETAIL_FEATURES);
  const fieldToggles = JSON.stringify({
    withArticleRichContentState: true,
    withArticlePlainText: true,
    withGrokAnalyze: true,
    withDisallowedReplyControls: true,
  });

  const params = new URLSearchParams({ variables, features, fieldToggles });
  const url = `${TWEET_DETAIL_URL}?${params.toString()}`;

  // Refresh ct0 CSRF token (Twitter rejects stale tokens from session files)
  const authToken = session.cookies["auth_token"]!;
  const freshCt0 = await getFreshCt0(authToken) ?? session.ct0;

  // Build full cookie string with fresh ct0
  const cookiesWithFreshCt0 = { ...session.cookies, ct0: freshCt0 };
  const cookieStr = Object.entries(cookiesWithFreshCt0)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  const response = await fetch(url, {
    headers: {
      accept: "*/*",
      authorization: TWITTER_BEARER_TOKEN,
      cookie: cookieStr,
      origin: "https://x.com",
      referer: "https://x.com/",
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      "x-csrf-token": freshCt0,
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
      "x-twitter-client-language": "en",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearSessionCache();
    }
    return null;
  }

  const data = (await response.json()) as Record<string, unknown>;
  return extractTweetText(data, tweetId);
}

// ── Core Functions ──────────────────────────────────────────────────

/**
 * Fetch tweet content via Twitter GraphQL API with OG scraper fallback.
 *
 * Primary: Twitter's internal GraphQL TweetDetail endpoint using
 * auth cookies from the shared tweety session (~/ticker/scraper/sessions/).
 * Fallback: OG meta tag scraping (works for some tweets).
 */
export async function fetchTweetContent(url: string): Promise<TweetContent> {
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
  const tweetId = extractTweetId(url);

  // Try Twitter GraphQL API first
  if (tweetId) {
    const session = loadTwitterSession();
    if (session) {
      try {
        const result = await fetchViaGraphQL(tweetId, session);
        if (result?.text) {
          return {
            url,
            content: result.text,
            author: result.author ?? author,
            threadContext: null,
            fetchedVia: "twitter_api",
          };
        }
      } catch {
        // GraphQL fetch failed -- fall through to OG scraper
      }
    }
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
 * Check if Twitter API auth is available (session file exists with valid cookies).
 * Replaces the old isCrawl4AIAvailable check.
 */
export function isTwitterSessionAvailable(): boolean {
  return loadTwitterSession() !== null;
}

/** @deprecated Use isTwitterSessionAvailable. Kept for test compatibility. */
export async function isCrawl4AIAvailable(): Promise<boolean> {
  return isTwitterSessionAvailable();
}

/**
 * Batch fetch tweet content with concurrency limiting and rate-limit backoff.
 *
 * Uses p-limit with concurrency of 2 and 1-second delay between requests
 * to respect Twitter rate limits.
 */
export async function batchFetchTweets(
  urls: string[],
  _crawl4aiUrl?: string,
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

      const result = await fetchTweetContent(url);
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
