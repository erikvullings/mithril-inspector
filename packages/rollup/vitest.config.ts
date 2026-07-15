import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "rollup",
    include: ["src/**/*.test.ts"],
  },
})
