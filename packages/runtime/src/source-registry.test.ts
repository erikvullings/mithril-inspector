import type { ModuleId, ModuleRecord } from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import { createSourceRegistry } from "./source-registry.js"
import type { ModuleRegistrationInput } from "./source-registry.js"

const MODULE: ModuleId = "m:src/UserCard.ts"

const registrationAt = (articleLine: number): ModuleRegistrationInput => ({
  file: "/project/src/UserCard.ts",
  relativeFile: "src/UserCard.ts",
  sources: {
    s1: {
      line: articleLine - 1,
      column: 3,
      endLine: articleLine - 1,
      endColumn: 20,
      kind: "component-view",
      displayName: "UserCard",
    },
    s2: {
      line: articleLine,
      column: 5,
      endLine: articleLine + 2,
      endColumn: 10,
      kind: "element",
      tagName: "article",
    },
  },
})

describe("createSourceRegistry", () => {
  it("resolves a qualified id to a full SourceLocation with the module's file", () => {
    const registry = createSourceRegistry()
    registry.registerModule(MODULE, registrationAt(5))

    const resolved = registry.resolveSource(`${MODULE}:s2`)
    expect(resolved).not.toBeNull()
    expect(resolved).toMatchObject({
      moduleId: MODULE,
      sourceId: "s2",
      absoluteFile: "/project/src/UserCard.ts",
      relativeFile: "src/UserCard.ts",
      line: 5,
      column: 5,
      endLine: 7,
      endColumn: 10,
      kind: "element",
      tagName: "article",
    })
  })

  it("omits absent optional fields rather than setting them to undefined", () => {
    const registry = createSourceRegistry()
    registry.registerModule(MODULE, {
      file: "/p/a.ts",
      relativeFile: "a.ts",
      sources: { s1: { line: 1, column: 1, kind: "unknown" } },
    })
    const resolved = registry.resolveSource(`${MODULE}:s1`)
    expect(resolved).not.toBeNull()
    expect("displayName" in (resolved as object)).toBe(false)
    expect("endLine" in (resolved as object)).toBe(false)
  })

  it("replaces a module's source table wholesale on re-registration (HMR)", () => {
    const registry = createSourceRegistry()
    registry.registerModule(MODULE, registrationAt(5))
    expect(registry.resolveSource(`${MODULE}:s2`)?.line).toBe(5)

    // The edited module moves the element and drops s2 in favour of a new s3.
    registry.registerModule(MODULE, {
      file: "/project/src/UserCard.ts",
      relativeFile: "src/UserCard.ts",
      sources: { s3: { line: 9, column: 5, kind: "element", tagName: "section" } },
    })

    // Old ids vanish; new id resolves; registry did not grow.
    expect(registry.resolveSource(`${MODULE}:s2`)).toBeNull()
    expect(registry.resolveSource(`${MODULE}:s3`)?.line).toBe(9)
    expect(registry.sourceCount()).toBe(1)
  })

  it("bumps the module generation on every re-registration", () => {
    const registry = createSourceRegistry()
    registry.registerModule(MODULE, registrationAt(5))
    expect(registry.generationOf(MODULE)).toBe(1)
    registry.registerModule(MODULE, registrationAt(6))
    expect(registry.generationOf(MODULE)).toBe(2)
  })

  it("invalidateModule drops sources but keeps a tombstone so the next register bumps", () => {
    const registry = createSourceRegistry()
    registry.registerModule(MODULE, registrationAt(5))
    registry.invalidateModule(MODULE)
    expect(registry.resolveSource(`${MODULE}:s2`)).toBeNull()
    expect(registry.moduleCount()).toBe(0)
    registry.registerModule(MODULE, registrationAt(8))
    expect(registry.generationOf(MODULE)).toBe(2)
    expect(registry.resolveSource(`${MODULE}:s2`)?.line).toBe(8)
  })

  it("returns null for malformed or unknown ids without throwing", () => {
    const registry = createSourceRegistry()
    registry.registerModule(MODULE, registrationAt(5))
    expect(registry.resolveSource("nonsense")).toBeNull()
    expect(registry.resolveSource("m:missing:s1")).toBeNull()
    expect(registry.resolveSource(`${MODULE}:sX`)).toBeNull()
    expect(registry.resolveSource(":s1")).toBeNull()
  })

  it("accepts a protocol ModuleRecord via setModule and reflects it in the snapshot", () => {
    const registry = createSourceRegistry()
    const record: ModuleRecord = {
      id: MODULE,
      file: "/project/src/UserCard.ts",
      relativeFile: "src/UserCard.ts",
      sources: {
        s1: {
          moduleId: MODULE,
          sourceId: "s1",
          absoluteFile: "/project/src/UserCard.ts",
          relativeFile: "src/UserCard.ts",
          line: 3,
          column: 1,
          kind: "component-declaration",
          displayName: "UserCard",
        },
      },
    }
    registry.setModule(record)
    expect(registry.resolveSource(`${MODULE}:s1`)?.displayName).toBe("UserCard")

    const snapshot = registry.modulesSnapshot()
    expect(snapshot.get(MODULE)?.relativeFile).toBe("src/UserCard.ts")
    expect(snapshot.get(MODULE)?.sources.s1?.line).toBe(3)
  })

  it("parses qualified ids by splitting on the last colon", () => {
    const registry = createSourceRegistry()
    expect(registry.parseQualified(`${MODULE}:s2`)).toEqual({ moduleId: MODULE, sourceId: "s2" })
    expect(registry.parseQualified("m:a:b:s9")).toEqual({ moduleId: "m:a:b", sourceId: "s9" })
    expect(registry.parseQualified("garbage")).toBeNull()
  })
})
