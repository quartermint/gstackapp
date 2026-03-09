const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * Format an ISO date string as a human-readable relative time string.
 * Returns empty string for null/undefined input.
 *
 * Examples: "2 hours ago", "yesterday", "3 days ago", "2 months ago"
 */
export function formatRelativeTime(
  isoDate: string | null | undefined
): string {
  if (!isoDate) return "";

  const diff = Date.now() - new Date(isoDate).getTime();

  // Pick the most appropriate unit
  const absDiff = Math.abs(diff);
  const sign = diff >= 0 ? -1 : 1; // negative = past, positive = future for Intl

  if (absDiff < MINUTE) {
    return rtf.format(sign * Math.round(absDiff / SECOND), "second");
  }
  if (absDiff < HOUR) {
    return rtf.format(sign * Math.round(absDiff / MINUTE), "minute");
  }
  if (absDiff < DAY) {
    return rtf.format(sign * Math.round(absDiff / HOUR), "hour");
  }
  if (absDiff < MONTH) {
    return rtf.format(sign * Math.round(absDiff / DAY), "day");
  }

  return rtf.format(sign * Math.round(absDiff / MONTH), "month");
}
