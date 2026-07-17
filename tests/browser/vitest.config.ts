import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "browser",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Real Vite dev servers + real Chromium instances: run test files serially
    // per worker but allow the suite to use more than one process safely by
    // keeping each file's server/browser pair self-contained (own beforeAll).
    fileParallelism: false,
  },
})
