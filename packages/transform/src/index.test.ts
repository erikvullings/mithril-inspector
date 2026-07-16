import { describe, expect, it } from "vitest"

import { packageName, transformMithrilModule } from "./index.js"

describe("@mithril-inspector/transform", () => {
  it("exposes its package identity and the §4 transform entry point", () => {
    expect(packageName).toBe("@mithril-inspector/transform")
    expect(typeof transformMithrilModule).toBe("function")
  })
})
