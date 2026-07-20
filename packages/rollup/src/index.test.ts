import { describe, expect, it } from "vitest"

import mithrilInspectorDefault, { mithrilInspector, packageName } from "./index.js"

describe("@mithril-inspector/rollup", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@mithril-inspector/rollup")
  })

  it("exports mithrilInspector as both a named and default export", () => {
    expect(mithrilInspector).toBe(mithrilInspectorDefault)
    expect(typeof mithrilInspector).toBe("function")
  })

  it("returns a single Rollup plugin (§12.3)", () => {
    const plugin = mithrilInspector({}, { NODE_ENV: "development" })
    expect(plugin.name).toBe("mithril-inspector")
  })
})
