import { describe, it, expect, vi, afterEach } from "vitest";

describe("output", () => {
  afterEach(() => {
    delete process.env["NO_COLOR"];
    vi.resetModules();
  });

  describe("relativeTime", () => {
    it("returns 'never' for null", async () => {
      const { relativeTime } = await import("../output.js");
      expect(relativeTime(null)).toBe("never");
    });

    it("returns relative time for recent date", async () => {
      const { relativeTime } = await import("../output.js");
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(relativeTime(fiveMinAgo)).toBe("5m ago");
    });

    it("returns hours for dates within a day", async () => {
      const { relativeTime } = await import("../output.js");
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      expect(relativeTime(threeHoursAgo)).toBe("3h ago");
    });

    it("returns days for dates within a month", async () => {
      const { relativeTime } = await import("../output.js");
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(relativeTime(fiveDaysAgo)).toBe("5d ago");
    });

    it("returns 'just now' for very recent dates", async () => {
      const { relativeTime } = await import("../output.js");
      const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString();
      expect(relativeTime(tenSecondsAgo)).toBe("just now");
    });
  });

  describe("colors with NO_COLOR", () => {
    it("strips color when NO_COLOR is set", async () => {
      process.env["NO_COLOR"] = "1";
      vi.resetModules();
      const { colors } = await import("../output.js");
      expect(colors.green("test")).toBe("test");
      expect(colors.red("test")).toBe("test");
      expect(colors.yellow("test")).toBe("test");
      expect(colors.dim("test")).toBe("test");
      expect(colors.bold("test")).toBe("test");
    });

    it("adds ANSI codes when NO_COLOR is not set", async () => {
      delete process.env["NO_COLOR"];
      vi.resetModules();
      const { colors } = await import("../output.js");
      expect(colors.green("test")).toContain("\x1b[32m");
      expect(colors.green("test")).toContain("\x1b[0m");
    });
  });
});
