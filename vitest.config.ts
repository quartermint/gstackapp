import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/api/vitest.config.ts"],
  },
});
