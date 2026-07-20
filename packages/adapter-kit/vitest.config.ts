import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "adapter-kit",
    include: ["src/**/*.test.ts"],
  },
})
