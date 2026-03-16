/**
 * Output helpers for the MC CLI.
 * Respects NO_COLOR env var per https://no-color.org
 */

const NO_COLOR = !!process.env["NO_COLOR"];

export const colors = {
  green: (s: string) => (NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`),
  yellow: (s: string) => (NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`),
  red: (s: string) => (NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`),
  dim: (s: string) => (NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`),
  bold: (s: string) => (NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`),
  cyan: (s: string) => (NO_COLOR ? s : `\x1b[36m${s}\x1b[0m`),
};

export function success(msg: string): void {
  console.log(`${colors.green("\u2713")} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${colors.yellow("\u26A0")} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${colors.red("\u2717")} ${msg}`);
}

export function info(msg: string): void {
  console.log(msg);
}

/** Format a table with aligned columns */
export function table(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );

  const sep = widths.map((w) => "\u2500".repeat(w + 2)).join("\u253C");
  const formatRow = (row: string[]) =>
    row.map((cell, i) => ` ${(cell ?? "").padEnd(widths[i]!)} `).join("\u2502");

  console.log(formatRow(headers));
  console.log(sep);
  for (const row of rows) {
    console.log(formatRow(row));
  }
}

/** Relative time string: "5m ago", "3h ago", etc. */
export function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
