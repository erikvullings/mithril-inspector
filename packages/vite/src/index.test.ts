import { describe, expect, it } from "vitest"

import { packageName } from "./index.js"

describe("@mithril-inspector/vite", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@mithril-inspector/vite")
  })
})
