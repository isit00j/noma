// TEMPORARY: vitest config for the perf-baseline instrumentation tests.
// Delete with src/lib/noma/__tests__ when the baseline is done.
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/lib/noma/__tests__/**/*.test.ts"],
    environment: "node",
    testTimeout: 120000,
  },
});
