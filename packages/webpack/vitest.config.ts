import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "webpack",
    include: ["src/**/*.test.ts"],
  },
})
