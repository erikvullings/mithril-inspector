import { describe, expect, it } from "vitest"

import { packageName } from "./index.js"

describe("@mithril-inspector/server", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@mithril-inspector/server")
  })
})
