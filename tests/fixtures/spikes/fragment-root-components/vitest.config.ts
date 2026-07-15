import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "spike-fragment-root-components",
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
})
