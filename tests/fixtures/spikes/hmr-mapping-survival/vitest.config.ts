import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "spike-hmr-mapping-survival",
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
})
