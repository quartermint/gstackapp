import { createElement } from "react";
import type { ReactElement } from "react";

export type Severity = "critical" | "warning" | "healthy";

interface SeverityColorSet {
  text: string;
  bg: string;
  border: string;
  dot: string;
  icon: string;
}

/**
 * Warm-palette Tailwind class mappings for each severity level.
 * Rust for critical, gold-status for warning, sage for healthy.
 */
export const SEVERITY_COLORS: Record<Severity, SeverityColorSet> = {
  critical: {
    text: "text-rust",
    bg: "bg-rust/10 dark:bg-rust/15",
    border: "border-rust",
    dot: "bg-rust",
    icon: "text-rust",
  },
  warning: {
    text: "text-gold-status",
    bg: "bg-gold-status/10 dark:bg-gold-status/15",
    border: "border-gold-status",
    dot: "bg-gold-status",
    icon: "text-gold-status",
  },
  healthy: {
    text: "text-sage",
    bg: "bg-sage/10 dark:bg-sage/15",
    border: "border-sage",
    dot: "bg-sage",
    icon: "text-sage",
  },
};

/**
 * Returns an inline SVG React element for the given severity level.
 * - critical: filled exclamation triangle
 * - warning: exclamation circle
 * - healthy: check circle
 */
export function severityIcon(severity: Severity): ReactElement {
  const cls = `w-3.5 h-3.5 ${SEVERITY_COLORS[severity].icon} shrink-0`;

  if (severity === "critical") {
    return createElement(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 20 20",
        fill: "currentColor",
        className: cls,
        "aria-hidden": "true",
      },
      createElement("path", {
        fillRule: "evenodd",
        d: "M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.345 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z",
        clipRule: "evenodd",
      })
    );
  }

  if (severity === "warning") {
    return createElement(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 20 20",
        fill: "currentColor",
        className: cls,
        "aria-hidden": "true",
      },
      createElement("path", {
        fillRule: "evenodd",
        d: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z",
        clipRule: "evenodd",
      })
    );
  }

  // healthy: check circle
  return createElement(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 20 20",
      fill: "currentColor",
      className: cls,
      "aria-hidden": "true",
    },
    createElement("path", {
      fillRule: "evenodd",
      d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z",
      clipRule: "evenodd",
    })
  );
}
