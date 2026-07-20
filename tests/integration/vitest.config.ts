import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "integration",
    include: ["src/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
