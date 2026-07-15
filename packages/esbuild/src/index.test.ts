import { describe, expect, it } from "vitest"

import { packageName } from "./index.js"

describe("@mithril-inspector/esbuild", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@mithril-inspector/esbuild")
  })
})
