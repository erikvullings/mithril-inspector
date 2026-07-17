import type { ModuleId } from "@mithril-inspector/protocol"
import { afterEach, describe, expect, it } from "vitest"

import { createRuntime } from "./runtime.js"
import { __resetRuntimeForTests } from "./runtime.js"
import type { ModuleRegistrationInput } from "./source-registry.js"

const MODULE: ModuleId = "m:src/App.ts"

const registration: ModuleRegistrationInput = {
  file: "/project/src/App.ts",
  relativeFile: "src/App.ts",
  sources: {
    s2: { line: 4, column: 3, kind: "element", tagName: "div" },
  },
}

afterEach(() => {
  __resetRuntimeForTests()
})

describe("runtime configuration (task 0013 wiring)", () => {
  describe("invalidateModule", () => {
    it("drops a module's stamped sources so they resolve to null (§11.2, ADR-106)", () => {
      const runtime = createRuntime({ schedule: () => {} })
      runtime.registerSourceModule(MODULE, registration)
      const vnode = runtime.source(`${MODULE}:s2`, { tag: "div", attrs: null } as object)
      expect(runtime.sourceOfVnode(vnode)?.line).toBe(4)

      runtime.invalidateModule(MODULE)
      expect(runtime.sourceOfVnode(vnode)).toBeNull()
    })

    it("is a safe no-op for an unknown module id", () => {
      const runtime = createRuntime({ schedule: () => {} })
      expect(() => runtime.invalidateModule("m:does/not/exist" as ModuleId)).not.toThrow()
    })
  })

  describe("exposeDomAttributes (§13)", () => {
    it("leaves vnode attrs untouched by default", () => {
      const runtime = createRuntime({ schedule: () => {} })
      const vnode = { tag: "div", attrs: null } as { tag: string; attrs: Record<string, unknown> | null }
      runtime.source(`${MODULE}:s2`, vnode)
      expect(vnode.attrs).toBeNull()
    })

    it("stamps a compact data-mi attribute on element vnodes when enabled", () => {
      const runtime = createRuntime({ schedule: () => {}, exposeDomAttributes: true })
      const vnode = { tag: "div", attrs: null } as { tag: string; attrs: Record<string, unknown> | null }
      runtime.source(`${MODULE}:s2`, vnode)
      expect(vnode.attrs?.["data-mi"]).toBe(`${MODULE}:s2`)
    })

    it("never exposes an absolute path (only the qualified id) (§13)", () => {
      const runtime = createRuntime({ schedule: () => {}, exposeDomAttributes: true })
      const vnode = { tag: "div", attrs: null } as { tag: string; attrs: Record<string, unknown> | null }
      runtime.source(`${MODULE}:s2`, vnode)
      expect(String(vnode.attrs?.["data-mi"])).not.toContain("/project/")
    })

    it("preserves existing attrs when stamping", () => {
      const runtime = createRuntime({ schedule: () => {}, exposeDomAttributes: true })
      const vnode = { tag: "input", attrs: { id: "email" } } as { tag: string; attrs: Record<string, unknown> }
      runtime.source(`${MODULE}:s2`, vnode)
      expect(vnode.attrs.id).toBe("email")
      expect(vnode.attrs["data-mi"]).toBe(`${MODULE}:s2`)
    })

    it("does not stamp fragment, text or trusted vnodes", () => {
      const runtime = createRuntime({ schedule: () => {}, exposeDomAttributes: true })
      for (const tag of ["[", "#", "<"]) {
        const vnode = { tag, attrs: null } as { tag: string; attrs: Record<string, unknown> | null }
        runtime.source(`${MODULE}:s2`, vnode)
        expect(vnode.attrs).toBeNull()
      }
    })
  })

  describe("redaction config (§15)", () => {
    it("defaults to an empty key list with the standard replacement", () => {
      const runtime = createRuntime({ schedule: () => {} })
      expect(runtime.getRedactionConfig()).toEqual({ keys: [], replacement: "[redacted]" })
    })

    it("stores the configured redaction keys and replacement", () => {
      const runtime = createRuntime({
        schedule: () => {},
        redact: { keys: ["password", "token"], replacement: "***" },
      })
      expect(runtime.getRedactionConfig()).toEqual({ keys: ["password", "token"], replacement: "***" })
    })
  })
})
