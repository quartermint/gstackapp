import ogs from "open-graph-scraper";

const URL_REGEX = /https?:\/\/[^\s<>)"']+/gi;

export interface LinkMetadata {
  title: string | null;
  description: string | null;
  domain: string;
  image: string | null;
}

/**
 * Extract all URLs from a string.
 */
export function extractUrls(content: string): string[] {
  return content.match(URL_REGEX) ?? [];
}

/**
 * Check if a string contains any URLs.
 */
export function containsUrl(content: string): boolean {
  // Reset lastIndex since the regex has the global flag
  URL_REGEX.lastIndex = 0;
  return URL_REGEX.test(content);
}

/**
 * Extract Open Graph metadata from a URL.
 * Returns graceful fallback on failure -- never loses the URL domain.
 */
export async function extractLinkMetadata(url: string): Promise<LinkMetadata> {
  try {
    const { result } = await ogs({
      url,
      timeout: 5000,
      fetchOptions: {
        headers: { "user-agent": "MissionControl/1.0" },
      },
    });

    return {
      title: result.ogTitle ?? result.dcTitle ?? null,
      description: result.ogDescription ?? result.dcDescription ?? null,
      domain: new URL(url).hostname,
      image: result.ogImage?.[0]?.url ?? null,
    };
  } catch {
    // Extraction failed -- return minimal data, never lose the URL
    return {
      title: null,
      description: null,
      domain: new URL(url).hostname,
      image: null,
    };
  }
}
