import { describe, expect, it } from "vitest"

import { mithrilInspector, packageName } from "./index.js"
import mithrilInspectorDefault from "./index.js"

describe("@mithril-inspector/webpack", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@mithril-inspector/webpack")
  })

  it("exposes mithrilInspector as both a named and default export", () => {
    expect(typeof mithrilInspector).toBe("function")
    expect(mithrilInspectorDefault).toBe(mithrilInspector)
  })

  it("mithrilInspector() returns a plugin object with an apply(compiler) method", () => {
    const plugin = mithrilInspector()
    expect(typeof plugin.apply).toBe("function")
  })
})
