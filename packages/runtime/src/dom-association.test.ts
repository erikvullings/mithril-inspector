import m from "mithril"
import type { ModuleId } from "@mithril-inspector/protocol"
import { beforeEach, describe, expect, it } from "vitest"

import { createDomAssociationRegistry } from "./dom-association.js"
import { createSourceRegistry } from "./source-registry.js"
import type { ModuleRegistrationInput } from "./source-registry.js"

const MODULE: ModuleId = "m:src/View.ts"

let root: HTMLElement

beforeEach(() => {
  root = document.createElement("div")
  document.body.replaceChildren(root)
})

const setup = () => {
  const sources = createSourceRegistry()
  const assoc = createDomAssociationRegistry(sources)
  const register = (registration: ModuleRegistrationInput): void => {
    sources.registerModule(MODULE, registration)
  }
  return { sources, assoc, register }
}

const baseSources: ModuleRegistrationInput = {
  file: "/project/src/View.ts",
  relativeFile: "src/View.ts",
  sources: {
    s1: { line: 5, column: 3, kind: "element", tagName: "div" },
    s2: { line: 6, column: 5, kind: "element", tagName: "span" },
    s3: { line: 7, column: 5, kind: "element", tagName: "p" },
  },
}

describe("createDomAssociationRegistry", () => {
  it("resolves a tagged single element node to its source location", () => {
    const { assoc, register } = setup()
    register(baseSources)
    m.render(root, assoc.tag(`${MODULE}:s1`, m("div.box")))
    assoc.flush()

    const div = root.querySelector("div.box")!
    expect(assoc.resolveDomSource(div)?.line).toBe(5)
    expect(assoc.resolveDomSource(div)?.tagName).toBe("div")
  })

  it("resolves an untagged descendant to its nearest tagged ancestor", () => {
    const { assoc, register } = setup()
    register(baseSources)
    // Only the outer div is tagged; the inner span is a plain (untagged) child.
    m.render(root, assoc.tag(`${MODULE}:s1`, m("div.box", m("span.inner", "hi"))))
    assoc.flush()

    const span = root.querySelector("span.inner")!
    const text = span.firstChild!
    expect(assoc.resolveDomSource(span)?.line).toBe(5)
    expect(assoc.resolveDomSource(text)?.line).toBe(5)
  })

  it("resolves nested tagged nodes to their own innermost source", () => {
    const { assoc, register } = setup()
    register(baseSources)
    m.render(
      root,
      assoc.tag(`${MODULE}:s1`, m("div.box", assoc.tag(`${MODULE}:s2`, m("span.inner", "hi")))),
    )
    assoc.flush()

    expect(assoc.resolveDomSource(root.querySelector("div.box")!)?.line).toBe(5)
    expect(assoc.resolveDomSource(root.querySelector("span.inner")!)?.line).toBe(6)
  })

  it("registers every top-level node of a fragment range", () => {
    const { assoc, register } = setup()
    register(baseSources)
    m.render(root, assoc.tag(`${MODULE}:s1`, m("[", m("p.a", "a"), m("p.b", "b"))))
    assoc.flush()

    expect(assoc.resolveDomSource(root.querySelector("p.a")!)?.line).toBe(5)
    expect(assoc.resolveDomSource(root.querySelector("p.b")!)?.line).toBe(5)
  })

  it("resolves a stamped vnode directly (the hover-on-vnode path)", () => {
    const { assoc, register } = setup()
    register(baseSources)
    const vnode = assoc.tag(`${MODULE}:s2`, m("span"))
    m.render(root, vnode)
    assoc.flush()
    expect(assoc.sourceIdOfVnode(vnode as object)).toBe(`${MODULE}:s2`)
    expect(assoc.sourceOfVnode(vnode as object)?.line).toBe(6)
  })

  it("reflects HMR: after re-registration the same node resolves to the new line", () => {
    const { assoc, register } = setup()
    register(baseSources)
    const build = () => assoc.tag(`${MODULE}:s1`, m("div.box"))
    m.render(root, build())
    assoc.flush()
    expect(assoc.resolveDomSource(root.querySelector("div.box")!)?.line).toBe(5)

    register({
      file: "/project/src/View.ts",
      relativeFile: "src/View.ts",
      sources: { s1: { line: 12, column: 3, kind: "element", tagName: "div" } },
    })
    m.render(root, build())
    assoc.flush()
    expect(assoc.resolveDomSource(root.querySelector("div.box")!)?.line).toBe(12)
  })

  it("returns null for a node whose source module was invalidated mid-HMR", () => {
    const { assoc, sources, register } = setup()
    register(baseSources)
    m.render(root, assoc.tag(`${MODULE}:s1`, m("div.box")))
    assoc.flush()
    const div = root.querySelector("div.box")!
    expect(assoc.resolveDomSource(div)).not.toBeNull()

    sources.invalidateModule(MODULE)
    expect(() => assoc.resolveDomSource(div)).not.toThrow()
    expect(assoc.resolveDomSource(div)).toBeNull()
  })

  it("retains a removed node's last-known source for stale selection (§8.8)", () => {
    const { assoc, register } = setup()
    register(baseSources)
    m.render(root, assoc.tag(`${MODULE}:s1`, m("div.box")))
    assoc.flush()
    const div = root.querySelector("div.box")!
    expect(assoc.resolveDomSource(div)?.line).toBe(5)

    // Redraw removes the element; the detached node keeps its last-known source.
    m.render(root, m("section.other"))
    assoc.flush()
    expect(root.querySelector("div.box")).toBeNull()
    expect(assoc.resolveDomSource(div)?.line).toBe(5)
  })

  it("excludes an overlay host and its subtree from tracking (§8.2)", () => {
    const { assoc, register } = setup()
    register(baseSources)
    const host = document.createElement("div")
    host.id = "__mithril-inspector-host"
    document.body.appendChild(host)
    assoc.excludeHost(host)

    m.render(host, assoc.tag(`${MODULE}:s1`, m("div.inside-host")))
    assoc.flush()
    const inside = host.querySelector("div.inside-host")!
    expect(assoc.resolveDomSource(inside)).toBeNull()
  })

  it("associates tagged nodes across multiple application roots in one flush (§3.1)", () => {
    const { assoc, register } = setup()
    register(baseSources)
    const rootA = document.createElement("div")
    const rootB = document.createElement("div")
    document.body.append(rootA, rootB)

    m.render(rootA, assoc.tag(`${MODULE}:s1`, m("div.a")))
    m.render(rootB, assoc.tag(`${MODULE}:s2`, m("span.b")))
    assoc.flush()

    expect(assoc.resolveDomSource(rootA.querySelector("div.a")!)?.line).toBe(5)
    expect(assoc.resolveDomSource(rootB.querySelector("span.b")!)?.line).toBe(6)
  })

  it("does not mutate the application vnode's attrs when tagging (§6.2)", () => {
    const { assoc } = setup()
    const vnode = m("div", { class: "box", onclick: () => {} })
    const before = Object.keys(vnode.attrs as object)
    const returned = assoc.tag(`${MODULE}:s1`, vnode)
    // The metadata lives in a WeakMap; tagging adds no enumerable attr key and
    // returns the same vnode object unchanged (§6.2).
    expect(returned).toBe(vnode)
    expect(Object.keys(vnode.attrs as object)).toEqual(before)
    expect(Object.getOwnPropertySymbols(vnode)).toEqual([])
  })
})
