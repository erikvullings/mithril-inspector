import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "overlay",
    include: ["src/**/*.test.ts"],
  },
})
