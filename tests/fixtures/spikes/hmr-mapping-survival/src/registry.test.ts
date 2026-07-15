import { describe, expect, it } from "vitest"

import { createRuntimeRegistry } from "./hmr.js"
import type { ModuleId, ModuleRegistration, QualifiedSourceId } from "./hmr.js"

const USER_CARD: ModuleId = "m:src/UserCard.ts"

/** A registration mirroring the transform's `registerModule("m:…", { … })` call. */
const userCardV1: ModuleRegistration = {
  file: "/project/src/UserCard.ts",
  relativeFile: "src/UserCard.ts",
  sources: {
    s1: { line: 4, column: 3, kind: "component-view", displayName: "UserCard" },
    s2: { line: 5, column: 5, kind: "element", tagName: "article" },
    s3: { line: 6, column: 7, kind: "element", tagName: "h2" },
  },
}

describe("runtime source registry — registration and resolution", () => {
  it("resolves a qualified source id to its 1-based location, kind and file", () => {
    const registry = createRuntimeRegistry()
    registry.registerModule(USER_CARD, userCardV1)

    const article = registry.resolveSource(`${USER_CARD}:s2`)
    expect(article).not.toBeNull()
    expect(article?.line).toBe(5)
    expect(article?.column).toBe(5)
    expect(article?.kind).toBe("element")
    expect(article?.tagName).toBe("article")
    expect(article?.relativeFile).toBe("src/UserCard.ts")
    expect(article?.moduleId).toBe(USER_CARD)
    expect(article?.sourceId).toBe("s2")
  })

  it("returns null for an unknown module or unknown source id (never throws)", () => {
    const registry = createRuntimeRegistry()
    registry.registerModule(USER_CARD, userCardV1)

    expect(registry.resolveSource("m:does/not/exist:s1")).toBeNull()
    expect(registry.resolveSource(`${USER_CARD}:s99`)).toBeNull()
    // A malformed id must degrade to null, not crash.
    expect(registry.resolveSource("not-a-qualified-id" as QualifiedSourceId)).toBeNull()
  })
})

describe("HMR invalidation and re-registration protocol", () => {
  it("re-registering a module replaces its sources rather than appending, and yields the new lines", () => {
    const registry = createRuntimeRegistry()
    registry.registerModule(USER_CARD, userCardV1)
    expect(registry.sourceCount()).toBe(3)
    expect(registry.generationOf(USER_CARD)).toBe(1)

    // The edit added two import lines above the component and dropped the <h2>.
    const userCardV2: ModuleRegistration = {
      file: "/project/src/UserCard.ts",
      relativeFile: "src/UserCard.ts",
      sources: {
        s1: { line: 6, column: 3, kind: "component-view", displayName: "UserCard" },
        s2: { line: 7, column: 5, kind: "element", tagName: "article" },
      },
    }
    registry.registerModule(USER_CARD, userCardV2)

    // Stable id -> new line numbers.
    expect(registry.resolveSource(`${USER_CARD}:s2`)?.line).toBe(7)
    // The dropped source is gone, not lingering.
    expect(registry.resolveSource(`${USER_CARD}:s3`)).toBeNull()
    // No growth: exactly the latest registration's sources remain.
    expect(registry.sourceCount()).toBe(2)
    expect(registry.generationOf(USER_CARD)).toBe(2)
  })

  it("does not grow the registry across many repeated edits of the same module", () => {
    const registry = createRuntimeRegistry()
    for (let edit = 0; edit < 25; edit += 1) {
      registry.registerModule(USER_CARD, {
        file: "/project/src/UserCard.ts",
        relativeFile: "src/UserCard.ts",
        sources: {
          s1: { line: edit + 1, column: 3, kind: "component-view", displayName: "UserCard" },
          s2: { line: edit + 2, column: 5, kind: "element", tagName: "article" },
        },
      })
    }
    // 25 edits, still only the latest two sources.
    expect(registry.sourceCount()).toBe(2)
    expect(registry.moduleCount()).toBe(1)
    expect(registry.generationOf(USER_CARD)).toBe(25)
    expect(registry.resolveSource(`${USER_CARD}:s2`)?.line).toBe(26)
  })

  it("invalidateModule drops the module's sources so resolution reports 'replaced during HMR' (null)", () => {
    const registry = createRuntimeRegistry()
    registry.registerModule(USER_CARD, userCardV1)

    // handleHotUpdate fires before the replacement module executes.
    registry.invalidateModule(USER_CARD)

    expect(registry.resolveSource(`${USER_CARD}:s2`)).toBeNull()
    expect(registry.sourceCount()).toBe(0)
    // Re-registration (the re-executed module) restores resolution with new lines.
    registry.registerModule(USER_CARD, {
      file: "/project/src/UserCard.ts",
      relativeFile: "src/UserCard.ts",
      sources: { s2: { line: 9, column: 5, kind: "element", tagName: "article" } },
    })
    expect(registry.resolveSource(`${USER_CARD}:s2`)?.line).toBe(9)
    expect(registry.generationOf(USER_CARD)).toBe(2)
  })

  it("invalidating an unknown module is a no-op (never throws)", () => {
    const registry = createRuntimeRegistry()
    expect(() => registry.invalidateModule("m:never/registered")).not.toThrow()
  })

  it("keeps several interleaved modules independent across repeated re-registrations", () => {
    const registry = createRuntimeRegistry()
    const A: ModuleId = "m:src/A.ts"
    const B: ModuleId = "m:src/B.ts"
    const C: ModuleId = "m:src/C.ts"
    const reg = (line: number, name: string): ModuleRegistration => ({
      file: `/project/src/${name}.ts`,
      relativeFile: `src/${name}.ts`,
      sources: {
        s1: { line, column: 1, kind: "component-view", displayName: name },
        s2: { line: line + 1, column: 3, kind: "element", tagName: "div" },
      },
    })

    // Initial registration order and later edits are deliberately interleaved,
    // not grouped per module, to catch any cross-module leakage or ordering
    // assumption in replace-on-re-register.
    registry.registerModule(A, reg(10, "A"))
    registry.registerModule(B, reg(20, "B"))
    registry.registerModule(C, reg(30, "C"))
    registry.registerModule(B, reg(200, "B")) // edit B
    registry.registerModule(A, reg(100, "A")) // edit A
    registry.registerModule(C, reg(300, "C")) // edit C
    registry.registerModule(B, reg(2000, "B")) // edit B again

    expect(registry.resolveSource(`${A}:s1`)?.line).toBe(100)
    expect(registry.resolveSource(`${B}:s1`)?.line).toBe(2000)
    expect(registry.resolveSource(`${C}:s1`)?.line).toBe(300)
    expect(registry.resolveSource(`${A}:s1`)?.displayName).toBe("A")
    expect(registry.resolveSource(`${B}:s2`)?.line).toBe(2001)

    // Three modules, two sources each — bounded regardless of edit interleaving.
    expect(registry.moduleCount()).toBe(3)
    expect(registry.sourceCount()).toBe(6)
    expect(registry.generationOf(A)).toBe(2)
    expect(registry.generationOf(B)).toBe(3)
    expect(registry.generationOf(C)).toBe(2)
  })
})

describe("selection survival across HMR", () => {
  it("keeps a selection live through a line-shift edit that preserves structure", () => {
    const registry = createRuntimeRegistry()
    registry.registerModule(USER_CARD, userCardV1)

    const selected = registry.select(`${USER_CARD}:s2`) // the <article>
    expect(selected.status).toBe("live")

    // Two lines added above; same markers, shifted lines.
    registry.invalidateModule(USER_CARD)
    registry.registerModule(USER_CARD, {
      file: "/project/src/UserCard.ts",
      relativeFile: "src/UserCard.ts",
      sources: {
        s1: { line: 6, column: 3, kind: "component-view", displayName: "UserCard" },
        s2: { line: 7, column: 5, kind: "element", tagName: "article" },
        s3: { line: 8, column: 7, kind: "element", tagName: "h2" },
      },
    })

    const now = registry.currentSelection()
    expect(now.status).toBe("live")
    if (now.status === "live") {
      expect(now.recovered).toBe(false)
      expect(now.location.line).toBe(7)
      expect(now.location.tagName).toBe("article")
    }
  })

  it("recovers a selection by identity when an inserted element shifts the source ids", () => {
    const registry = createRuntimeRegistry()
    registry.registerModule(USER_CARD, userCardV1) // s2 = article
    registry.select(`${USER_CARD}:s2`)

    // A <header> is inserted before the <article>, so the article's marker id
    // shifts from s2 to s3; s2 now denotes the new header.
    registry.invalidateModule(USER_CARD)
    registry.registerModule(USER_CARD, {
      file: "/project/src/UserCard.ts",
      relativeFile: "src/UserCard.ts",
      sources: {
        s1: { line: 4, column: 3, kind: "component-view", displayName: "UserCard" },
        s2: { line: 5, column: 5, kind: "element", tagName: "header" },
        s3: { line: 6, column: 5, kind: "element", tagName: "article" },
        s4: { line: 7, column: 7, kind: "element", tagName: "h2" },
      },
    })

    const now = registry.currentSelection()
    expect(now.status).toBe("live")
    if (now.status === "live") {
      // Identity (the <article>) recovered at its new id and line.
      expect(now.recovered).toBe(true)
      expect(now.location.tagName).toBe("article")
      expect(now.location.line).toBe(6)
      expect(now.ref.sourceId).toBe("s3")
    }
  })

  it("recovers a component selection by displayName even though the id moved", () => {
    const registry = createRuntimeRegistry()
    registry.registerModule(USER_CARD, userCardV1) // s1 = UserCard declaration
    registry.select(`${USER_CARD}:s1`)

    // A helper component is declared above UserCard, moving UserCard to s2.
    registry.invalidateModule(USER_CARD)
    registry.registerModule(USER_CARD, {
      file: "/project/src/UserCard.ts",
      relativeFile: "src/UserCard.ts",
      sources: {
        s1: { line: 4, column: 3, kind: "component-view", displayName: "Avatar" },
        s2: { line: 12, column: 3, kind: "component-view", displayName: "UserCard" },
      },
    })

    const now = registry.currentSelection()
    expect(now.status).toBe("live")
    if (now.status === "live") {
      expect(now.recovered).toBe(true)
      expect(now.location.displayName).toBe("UserCard")
      expect(now.location.line).toBe(12)
      expect(now.ref.sourceId).toBe("s2")
    }
  })

  it("degrades a selection to a documented stale state when its source is deleted (never throws)", () => {
    const registry = createRuntimeRegistry()
    registry.registerModule(USER_CARD, userCardV1) // s2 = article
    registry.select(`${USER_CARD}:s2`)

    // The edit removes the <article> entirely.
    registry.invalidateModule(USER_CARD)
    registry.registerModule(USER_CARD, {
      file: "/project/src/UserCard.ts",
      relativeFile: "src/UserCard.ts",
      sources: {
        s1: { line: 4, column: 3, kind: "component-view", displayName: "UserCard" },
        s2: { line: 5, column: 5, kind: "element", tagName: "section" },
      },
    })

    let now = registry.currentSelection()
    expect(now.status).toBe("stale")
    if (now.status === "stale") {
      expect(now.reason.length).toBeGreaterThan(0)
      expect(now.ref.qualifiedId).toBe(`${USER_CARD}:s2`)
    }
    // Reading it again is stable and still never throws.
    now = registry.currentSelection()
    expect(now.status).toBe("stale")
  })

  it("degrades to stale when the selected module is invalidated and never re-registered (file deleted)", () => {
    const registry = createRuntimeRegistry()
    registry.registerModule(USER_CARD, userCardV1)
    registry.select(`${USER_CARD}:s1`)

    registry.invalidateModule(USER_CARD) // module removed, nothing re-registers

    const now = registry.currentSelection()
    expect(now.status).toBe("stale")
  })

  it("keeps an indistinguishable sibling live via its stable id rather than guessing", () => {
    const registry = createRuntimeRegistry()
    const LIST: ModuleId = "m:src/List.ts"
    const threeItems: ModuleRegistration = {
      file: "/project/src/List.ts",
      relativeFile: "src/List.ts",
      sources: {
        s1: { line: 2, column: 3, kind: "component-view", displayName: "List" },
        s2: { line: 3, column: 5, kind: "element", tagName: "li" },
        s3: { line: 4, column: 5, kind: "element", tagName: "li" },
        s4: { line: 5, column: 5, kind: "element", tagName: "li" },
      },
    }
    registry.registerModule(LIST, threeItems)
    registry.select(`${LIST}:s2`) // one of three identical <li>

    // One later <li> is removed; s2 still denotes an <li>, so the stable-id path
    // keeps the selection live at s2 without guessing among the siblings.
    registry.invalidateModule(LIST)
    registry.registerModule(LIST, {
      file: "/project/src/List.ts",
      relativeFile: "src/List.ts",
      sources: {
        s1: { line: 2, column: 3, kind: "component-view", displayName: "List" },
        s2: { line: 3, column: 5, kind: "element", tagName: "li" },
        s3: { line: 4, column: 5, kind: "element", tagName: "li" },
      },
    })

    const now = registry.currentSelection()
    expect(now.status).toBe("live")
    if (now.status === "live") {
      expect(now.recovered).toBe(false)
      expect(now.ref.sourceId).toBe("s2")
    }
  })

  it("refuses to recover (stays stale) when the id is gone and multiple candidates are ambiguous", () => {
    const registry = createRuntimeRegistry()
    const LIST: ModuleId = "m:src/List.ts"
    registry.registerModule(LIST, {
      file: "/project/src/List.ts",
      relativeFile: "src/List.ts",
      sources: {
        s1: { line: 2, column: 3, kind: "component-view", displayName: "List" },
        s2: { line: 3, column: 5, kind: "element", tagName: "li" },
        s3: { line: 4, column: 5, kind: "element", tagName: "li" },
        s4: { line: 5, column: 5, kind: "element", tagName: "li" }, // selected
      },
    })
    registry.select(`${LIST}:s4`)

    // The edit shortens the list to two <li>; s4 no longer resolves, and two
    // indistinguishable <li> candidates remain — recovery must not guess.
    registry.invalidateModule(LIST)
    registry.registerModule(LIST, {
      file: "/project/src/List.ts",
      relativeFile: "src/List.ts",
      sources: {
        s1: { line: 2, column: 3, kind: "component-view", displayName: "List" },
        s2: { line: 3, column: 5, kind: "element", tagName: "li" },
        s3: { line: 4, column: 5, kind: "element", tagName: "li" },
      },
    })

    const now = registry.currentSelection()
    expect(now.status).toBe("stale")
  })
})
