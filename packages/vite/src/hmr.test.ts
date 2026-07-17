import type { ModuleId } from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import { createModuleIdRegistry, HMR_INVALIDATE_EVENT, normalizeFile } from "./hmr.js"

describe("normalizeFile", () => {
  it("canonicalizes separators and strips queries so ids match across hooks (ADR-106)", () => {
    expect(normalizeFile("C:\\repo\\src\\App.ts")).toBe("C:/repo/src/App.ts")
    expect(normalizeFile("/repo/src/App.ts?v=123")).toBe("/repo/src/App.ts")
  })
})

describe("createModuleIdRegistry", () => {
  it("records and resolves a file's module id regardless of separator/query", () => {
    const registry = createModuleIdRegistry()
    registry.record("/repo/src/App.ts", "m:abc" as ModuleId)
    expect(registry.moduleIdFor("/repo/src/App.ts")).toBe("m:abc")
    expect(registry.moduleIdFor("/repo/src/App.ts?t=1")).toBe("m:abc")
  })

  it("forgets an entry", () => {
    const registry = createModuleIdRegistry()
    registry.record("/repo/src/App.ts", "m:abc" as ModuleId)
    registry.forget("/repo/src/App.ts")
    expect(registry.moduleIdFor("/repo/src/App.ts")).toBeUndefined()
  })

  it("returns undefined for an unknown file", () => {
    expect(createModuleIdRegistry().moduleIdFor("/repo/src/Unknown.ts")).toBeUndefined()
  })

  it("exposes a stable HMR event name", () => {
    expect(HMR_INVALIDATE_EVENT).toBe("mithril-inspector:invalidate")
  })
})
