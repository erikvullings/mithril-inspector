import { describe, expect, it } from "vitest"

import { applyPathMappings } from "./path-mappings.js"

describe("applyPathMappings", () => {
  it("returns the original path when there are no mappings", () => {
    expect(applyPathMappings("/workspace/src/foo.ts", [])).toBe("/workspace/src/foo.ts")
  })

  it("rewrites a path nested under a mapping's from prefix", () => {
    const mappings = [{ from: "/workspace", to: "/Users/erik/projects/app" }]
    expect(applyPathMappings("/workspace/src/foo.ts", mappings)).toBe(
      "/Users/erik/projects/app/src/foo.ts",
    )
  })

  it("rewrites a path that matches a mapping's from exactly", () => {
    const mappings = [{ from: "/workspace", to: "/Users/erik/projects/app" }]
    expect(applyPathMappings("/workspace", mappings)).toBe("/Users/erik/projects/app")
  })

  it("does not rewrite a path that merely shares a prefix without a separator boundary", () => {
    const mappings = [{ from: "/workspace", to: "/mapped" }]
    expect(applyPathMappings("/workspace-other/src/foo.ts", mappings)).toBe(
      "/workspace-other/src/foo.ts",
    )
  })

  it("applies the first matching mapping in array order", () => {
    const mappings = [
      { from: "/workspace/src", to: "/mapped/src" },
      { from: "/workspace", to: "/mapped/generic" },
    ]
    expect(applyPathMappings("/workspace/src/foo.ts", mappings)).toBe("/mapped/src/foo.ts")
  })

  it("leaves unmatched paths untouched", () => {
    const mappings = [{ from: "/workspace", to: "/mapped" }]
    expect(applyPathMappings("/other/src/foo.ts", mappings)).toBe("/other/src/foo.ts")
  })
})
