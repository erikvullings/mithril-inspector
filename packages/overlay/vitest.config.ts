import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "overlay",
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
})
