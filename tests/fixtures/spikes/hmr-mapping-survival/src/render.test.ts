import m from "mithril"
import type { Component, VnodeDOM } from "mithril"
import { beforeEach, describe, expect, it } from "vitest"

import { createRuntimeRegistry } from "./hmr.js"
import type { ModuleId, ModuleRegistration, RuntimeRegistry } from "./hmr.js"

const USER_CARD: ModuleId = "m:src/UserCard.ts"

let root: HTMLElement

beforeEach(() => {
  root = document.createElement("div")
  document.body.replaceChildren(root)
})

/**
 * Builds the component the transform would emit for one version of the source
 * file: its `view` stamps the `<article>` element vnode with the module's `s2`
 * source id (the runtime's `__miSource` marker, §6.2) and records the freshly
 * created vnode so the test can "hover" it after render. A brand-new component
 * object is returned per version, mirroring how HMR replaces the module export
 * and gives Mithril a different `tag` (forcing a remount).
 */
function buildUserCard(registry: RuntimeRegistry): {
  component: Component
  lastArticle: () => VnodeDOM<unknown, unknown> | undefined
} {
  let article: VnodeDOM<unknown, unknown> | undefined
  const component: Component = {
    view: () => {
      // The transform stamps the element vnode; after render Mithril sets its
      // `.dom`, so the captured vnode is a `VnodeDOM` for the hover assertions.
      const vnode = registry.mark(
        `${USER_CARD}:s2`,
        m("article.user-card", m("h2", "hello")),
      ) as VnodeDOM<unknown, unknown>
      article = vnode
      return vnode
    },
  }
  return { component, lastArticle: () => article }
}

const registerAt = (registry: RuntimeRegistry, articleLine: number): void => {
  const registration: ModuleRegistration = {
    file: "/project/src/UserCard.ts",
    relativeFile: "src/UserCard.ts",
    sources: {
      s1: { line: articleLine - 1, column: 3, kind: "component-view", displayName: "UserCard" },
      s2: { line: articleLine, column: 5, kind: "element", tagName: "article" },
    },
  }
  registry.registerModule(USER_CARD, registration)
}

describe("HMR mapping survival against real m.render", () => {
  it("hovering the re-rendered element resolves to the NEW line numbers after an edit", () => {
    const registry = createRuntimeRegistry()

    // v1 of the file: the <article> is on line 5.
    registerAt(registry, 5)
    const v1 = buildUserCard(registry)
    m.render(root, m(v1.component))

    const articleV1 = v1.lastArticle()
    expect(articleV1).toBeDefined()
    // The stamped vnode is the one actually rendered into the DOM.
    expect(articleV1?.dom).toBe(root.querySelector("article.user-card"))
    // Hover -> resolve -> original line.
    expect(registry.sourceOf(articleV1 as object)?.line).toBe(5)

    // --- HMR round-trip: handleHotUpdate invalidates, the replacement module
    // re-registers (article now on line 8) and Mithril remounts the new export.
    registry.invalidateModule(USER_CARD)
    registerAt(registry, 8)
    const v2 = buildUserCard(registry)
    m.render(root, m(v2.component))

    const articleV2 = v2.lastArticle()
    expect(articleV2).toBeDefined()
    expect(articleV2?.dom).toBe(root.querySelector("article.user-card"))
    // Hovering the re-rendered element now resolves to the NEW line.
    expect(registry.sourceOf(articleV2 as object)?.line).toBe(8)
  })

  it("remounts on HMR (new component instance) yet recovers the selection by displayName", () => {
    const registry = createRuntimeRegistry()
    registerAt(registry, 5)

    const v1 = buildUserCard(registry)
    const usage1 = m(v1.component)
    m.render(root, usage1)
    const state1 = usage1.state as object
    // Select the component declaration (s1, displayName "UserCard").
    expect(registry.select(`${USER_CARD}:s1`).status).toBe("live")

    // HMR: replace module + remount with a brand-new component object.
    registry.invalidateModule(USER_CARD)
    registerAt(registry, 20)
    const v2 = buildUserCard(registry)
    const usage2 = m(v2.component)
    m.render(root, usage2)
    const state2 = usage2.state as object

    // Component *instance* identity did not survive: Mithril mounted a new state
    // object (different module export => different tag => remount).
    expect(state2).not.toBe(state1)

    // The *selection* survived by re-resolving to the new declaration line.
    const now = registry.currentSelection()
    expect(now.status).toBe("live")
    if (now.status === "live") {
      expect(now.location.displayName).toBe("UserCard")
      expect(now.location.line).toBe(19)
    }
  })

  it("never throws when a selected element is unmapped mid-HMR; reports a stale/null mapping", () => {
    const registry = createRuntimeRegistry()
    registerAt(registry, 5)
    const v1 = buildUserCard(registry)
    m.render(root, m(v1.component))
    const articleV1 = v1.lastArticle() as object

    registry.select(`${USER_CARD}:s2`)
    expect(registry.currentSelection().status).toBe("live")

    // Between handleHotUpdate and the replacement module executing, the module's
    // sources are invalidated: resolving the still-mounted vnode must degrade to
    // null (=> "Source file was replaced during HMR"), not crash.
    registry.invalidateModule(USER_CARD)
    expect(() => registry.sourceOf(articleV1)).not.toThrow()
    expect(registry.sourceOf(articleV1)).toBeNull()
    expect(registry.currentSelection().status).toBe("stale")

    // The replacement module drops the <article>; the selection stays stale but
    // the app keeps rendering and nothing throws.
    registry.registerModule(USER_CARD, {
      file: "/project/src/UserCard.ts",
      relativeFile: "src/UserCard.ts",
      sources: {
        s1: { line: 4, column: 3, kind: "component-view", displayName: "UserCard" },
        s2: { line: 5, column: 5, kind: "element", tagName: "section" },
      },
    })
    expect(registry.currentSelection().status).toBe("stale")
    expect(() => m.render(root, m(buildUserCard(registry).component))).not.toThrow()
  })
})
