import { describe, expect, it } from "vitest"

import mithrilInspectorDefault, { createEsbuildDevServer, mithrilInspector, packageName } from "./index.js"

describe("@mithril-inspector/esbuild", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@mithril-inspector/esbuild")
  })

  it("exports mithrilInspector as both a named and default export", () => {
    expect(mithrilInspector).toBe(mithrilInspectorDefault)
    expect(typeof mithrilInspector).toBe("function")
  })

  it("returns a single esbuild plugin (§12.4)", () => {
    const plugin = mithrilInspector({}, { NODE_ENV: "development" })
    expect(plugin.name).toBe("mithril-inspector")
  })

  it("exports the helper dev server", () => {
    expect(typeof createEsbuildDevServer).toBe("function")
  })
})
