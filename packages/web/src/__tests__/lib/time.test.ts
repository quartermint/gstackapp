import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "../../lib/time.js";

describe("formatRelativeTime", () => {
  it("returns a string containing 'hour' for a date 1 hour ago", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(oneHourAgo);
    expect(result).toMatch(/hour/i);
  });

  it("returns a string containing 'day' for a date 3 days ago", () => {
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000
    ).toISOString();
    const result = formatRelativeTime(threeDaysAgo);
    expect(result).toMatch(/day/i);
  });

  it("returns empty string for null input", () => {
    const result = formatRelativeTime(null);
    expect(result).toBe("");
  });

  it("returns empty string for undefined input", () => {
    const result = formatRelativeTime(undefined);
    expect(result).toBe("");
  });

  it("returns a string containing 'month' for a date 2 months ago", () => {
    const twoMonthsAgo = new Date(
      Date.now() - 60 * 24 * 60 * 60 * 1000
    ).toISOString();
    const result = formatRelativeTime(twoMonthsAgo);
    expect(result).toMatch(/month/i);
  });

  it("handles future dates gracefully", () => {
    const tomorrow = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();
    const result = formatRelativeTime(tomorrow);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
