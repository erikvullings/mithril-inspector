import { describe, expect, it } from "vitest"

import mithrilInspectorDefault, {
  mithrilInspector,
  OVERLAY_MODULE_ID,
  packageName,
  RUNTIME_MODULE_ID,
} from "./index.js"

describe("@mithril-inspector/vite", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@mithril-inspector/vite")
  })

  it("exports mithrilInspector as both a named and default export", () => {
    expect(mithrilInspector).toBe(mithrilInspectorDefault)
    expect(typeof mithrilInspector).toBe("function")
  })

  it("returns a Vite plugin array (§11.1)", () => {
    const result = mithrilInspector({}, { NODE_ENV: "development" })
    expect(Array.isArray(result)).toBe(true)
    const plugins = result as Array<{ name: string }>
    expect(plugins.map((p) => p.name)).toEqual(["mithril-inspector:pre", "mithril-inspector:serve"])
  })

  it("re-exports the virtual module specifiers", () => {
    expect(RUNTIME_MODULE_ID).toBe("virtual:mithril-inspector/runtime")
    expect(OVERLAY_MODULE_ID).toBe("virtual:mithril-inspector/overlay")
  })
})
