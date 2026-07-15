import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "vite",
    include: ["src/**/*.test.ts"],
  },
})
