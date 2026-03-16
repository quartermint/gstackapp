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

/**
 * Format an ISO date string as a compact elapsed duration from now.
 * Returns empty string for null/undefined input.
 *
 * Examples: "0s", "5m", "1h 23m", "2d 5h"
 */
export function formatElapsedTime(
  isoDate: string | null | undefined
): string {
  if (!isoDate) return "";

  const diff = Date.now() - new Date(isoDate).getTime();
  const absDiff = Math.abs(diff);

  if (absDiff < MINUTE) {
    return `${Math.floor(absDiff / SECOND)}s`;
  }
  if (absDiff < HOUR) {
    return `${Math.floor(absDiff / MINUTE)}m`;
  }
  if (absDiff < DAY) {
    const hours = Math.floor(absDiff / HOUR);
    const minutes = Math.floor((absDiff % HOUR) / MINUTE);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(absDiff / DAY);
  const hours = Math.floor((absDiff % DAY) / HOUR);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}
