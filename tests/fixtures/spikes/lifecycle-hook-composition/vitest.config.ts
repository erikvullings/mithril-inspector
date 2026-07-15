import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "spike-lifecycle-hook-composition",
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
})
