import { describe, expect, it } from "vitest"

import { packageName } from "./index.js"

describe("@mithril-inspector/rollup", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@mithril-inspector/rollup")
  })
})
