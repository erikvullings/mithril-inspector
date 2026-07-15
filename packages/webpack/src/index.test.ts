import { describe, expect, it } from "vitest"

import { packageName } from "./index.js"

describe("@mithril-inspector/webpack", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@mithril-inspector/webpack")
  })
})
