import type { InspectorRuntime } from "@mithril-inspector/runtime"
import type { SourceLocation } from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import { getOverlayHook, type OverlayHook } from "./hook.js"

// Compile-time guard: the real runtime hook must satisfy the overlay's expected
// subset. If the runtime's signatures drift, this assignment fails typecheck.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _runtimeSatisfiesOverlayHook: OverlayHook = {} as InspectorRuntime
void _runtimeSatisfiesOverlayHook

const source: SourceLocation = {
  moduleId: "m:x",
  sourceId: "s1",
  absoluteFile: "/p/a.ts",
  relativeFile: "a.ts",
  line: 1,
  column: 1,
  kind: "element",
}

function fakeHook(): OverlayHook {
  return {
    resolveDomSource: () => source,
    resolveDomComponent: () => null,
    componentRecord: () => undefined,
    componentAncestry: () => [],
    componentViewSource: () => null,
    sourceOfVnode: () => null,
    excludeHost: () => {},
    flush: () => {},
  }
}

describe("getOverlayHook", () => {
  it("returns the installed hook from a scope", () => {
    const hook = fakeHook()
    expect(getOverlayHook({ __MITHRIL_INSPECTOR__: hook })).toBe(hook)
  })

  it("returns null when the runtime is absent (production build)", () => {
    expect(getOverlayHook({})).toBeNull()
  })

  it("returns null for a value that is not a hook", () => {
    expect(getOverlayHook({ __MITHRIL_INSPECTOR__: { nope: true } })).toBeNull()
    expect(getOverlayHook({ __MITHRIL_INSPECTOR__: 42 })).toBeNull()
  })
})
