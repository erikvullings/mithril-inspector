import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "spike-sourcemap-preservation",
    include: ["src/**/*.test.ts"],
  },
})
