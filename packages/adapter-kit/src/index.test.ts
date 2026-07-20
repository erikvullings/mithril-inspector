import { describe, expect, it } from "vitest"

import { OVERLAY_MODULE_ID, packageName, RUNTIME_MODULE_ID } from "./index.js"

describe("@mithril-inspector/adapter-kit", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@mithril-inspector/adapter-kit")
  })

  it("re-exports the virtual module specifiers", () => {
    expect(RUNTIME_MODULE_ID).toBe("virtual:mithril-inspector/runtime")
    expect(OVERLAY_MODULE_ID).toBe("virtual:mithril-inspector/overlay")
  })
})
