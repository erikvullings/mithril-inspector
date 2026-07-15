import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "spike-vnode-dom-association",
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
})
