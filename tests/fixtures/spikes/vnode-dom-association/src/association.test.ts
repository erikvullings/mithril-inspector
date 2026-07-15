import m from "mithril"
import type { Component } from "mithril"
import { beforeEach, describe, expect, it } from "vitest"

import { createDomRegistry, domRangeOf, getSourceId, source } from "./association.js"

let root: HTMLElement

beforeEach(() => {
  root = document.createElement("div")
  document.body.replaceChildren(root)
})

describe("vnode-to-DOM association", () => {
  it("maps a tagged element vnode to its DOM node and the node back to its source ID", () => {
    const vnode = source("m1:s1", m("article.user-card", m("h2", "Alice")))
    m.render(root, vnode)

    const registry = createDomRegistry()
    registry.associateTree(vnode)

    const article = root.querySelector("article.user-card")
    expect(article).not.toBeNull()

    const range = domRangeOf(vnode as object)
    expect(range.first).toBe(article)
    expect(range.last).toBe(article)

    expect(registry.resolveSource(article as Node)?.sourceId).toBe("m1:s1")
  })

  it("resolves an untagged descendant node to its nearest tagged ancestor", () => {
    const vnode = source("m1:s1", m("article.user-card", m("h2", "Alice")))
    m.render(root, vnode)

    const registry = createDomRegistry()
    registry.associateTree(vnode)

    const heading = root.querySelector("h2") as Node
    expect(registry.resolveSource(heading)?.sourceId).toBe("m1:s1")
  })

  it("maps a tagged text expression to its rendered text node", () => {
    const greeting = source("m1:s2", "hello")
    const vnode = m("div", greeting, m("span", "world"))
    m.render(root, vnode)

    const registry = createDomRegistry()
    registry.associateTree(vnode)

    const textNode = (root.querySelector("div") as Element).firstChild as Node
    expect(textNode.nodeType).toBe(Node.TEXT_NODE)
    expect(textNode.textContent).toBe("hello")

    const range = domRangeOf(greeting as object)
    expect(range.first).toBe(textNode)
    expect(range.last).toBe(textNode)

    expect(registry.resolveSource(textNode)?.sourceId).toBe("m1:s2")
  })

  it("maps a tagged array fragment to the span of its rendered nodes", () => {
    const items = source("m1:s3", [m("span", "a"), source("m1:s4", m("b", "bold"))])
    const vnode = m("div", items)
    m.render(root, vnode)

    const registry = createDomRegistry()
    registry.associateTree(vnode)

    const div = root.querySelector("div") as Element
    const spanNode = div.childNodes[0] as Node
    const boldNode = div.childNodes[1] as Node
    expect((spanNode as Element).tagName).toBe("SPAN")
    expect((boldNode as Element).tagName).toBe("B")

    const range = domRangeOf(items as object)
    expect(range.first).toBe(spanNode)
    expect(range.last).toBe(boldNode)

    expect(registry.resolveSource(spanNode)?.sourceId).toBe("m1:s3")
    expect(registry.resolveSource(boldNode)?.sourceId).toBe("m1:s4")
    expect(registry.ownershipsOf(boldNode).map((entry) => entry.sourceId)).toEqual([
      "m1:s3",
      "m1:s4",
    ])
  })

  it("associates both a component usage and its view's element, the element winning", () => {
    const Card: Component<{ name: string }> = {
      view: (vnode) => source("m2:s2", m("article.card", vnode.attrs.name)),
    }
    const usage = source("m2:s1", m(Card, { name: "Ada" }))
    m.render(root, usage)

    const registry = createDomRegistry()
    registry.associateTree(usage)

    const article = root.querySelector("article.card") as Node
    const range = domRangeOf(usage as object)
    expect(range.first).toBe(article)
    expect(range.last).toBe(article)

    expect(registry.resolveSource(article)?.sourceId).toBe("m2:s2")
    expect(registry.ownershipsOf(article).map((entry) => entry.sourceId)).toEqual([
      "m2:s1",
      "m2:s2",
    ])
  })

  it("keeps associations correct across a keyed reorder with insertion and removal", () => {
    const item = (key: string, label: string) =>
      source(`m3:${key}`, m("li", { key }, label))

    const firstRender = m("ul", [item("a", "Ada"), item("b", "Bob"), item("c", "Cyd")])
    m.render(root, firstRender)

    const registry = createDomRegistry()
    registry.associateTree(firstRender)

    const [liA, liB, liC] = Array.from(root.querySelectorAll("li"))
    expect(liA?.textContent).toBe("Ada")

    const movedC = item("c", "Cyd")
    const insertedD = item("d", "Dee")
    const movedA = item("a", "Ada")
    const secondRender = m("ul", [movedC, insertedD, movedA])
    m.render(root, secondRender)
    registry.associateTree(secondRender)

    // Mithril moved the keyed DOM nodes instead of recreating them.
    const lis = Array.from(root.querySelectorAll("li"))
    expect(lis[0]).toBe(liC)
    expect(lis[2]).toBe(liA)
    const liD = lis[1] as Node

    // vnode → DOM follows the key, not the list position.
    expect(domRangeOf(movedC as object).first).toBe(liC)
    expect(domRangeOf(movedA as object).first).toBe(liA)
    expect(domRangeOf(insertedD as object).first).toBe(liD)

    // DOM → source stays correct and does not accumulate duplicate entries.
    expect(registry.resolveSource(liC as Node)?.sourceId).toBe("m3:c")
    expect(registry.resolveSource(liD)?.sourceId).toBe("m3:d")
    expect(registry.ownershipsOf(liA as Node).map((entry) => entry.sourceId)).toEqual(["m3:a"])

    // The removed node keeps its last-known record for stale-selection UX.
    expect((liB as Node).isConnected).toBe(false)
    expect(registry.ownershipsOf(liB as Node).map((entry) => entry.sourceId)).toEqual(["m3:b"])
  })

  it("reports an empty range for a tagged vnode that renders no DOM", () => {
    const Empty: Component = { view: () => null }
    const nothing = source("m4:s1", m(Empty))
    const vnode = m("div", m("span", "before"), nothing, m("span", "after"))
    m.render(root, vnode)

    const registry = createDomRegistry()
    registry.associateTree(vnode)

    expect(domRangeOf(nothing as object)).toEqual({ first: null, last: null })

    // The empty component must not claim its siblings' nodes.
    const [before, after] = Array.from(root.querySelectorAll("span"))
    expect(registry.resolveSource(before as Node)?.sourceId).toBeUndefined()
    expect(registry.resolveSource(after as Node)?.sourceId).toBeUndefined()
  })

  it("maps tagged trusted HTML to all of its top-level rendered nodes", () => {
    const trusted = source("m5:s1", m.trust("<i>one</i><u>two</u>"))
    const vnode = m("div", trusted)
    m.render(root, vnode)

    const registry = createDomRegistry()
    registry.associateTree(vnode)

    const italic = root.querySelector("i") as Node
    const underline = root.querySelector("u") as Node

    const range = domRangeOf(trusted as object)
    expect(range.first).toBe(italic)
    expect(range.last).toBe(underline)

    expect(registry.resolveSource(italic)?.sourceId).toBe("m5:s1")
    expect(registry.resolveSource(underline)?.sourceId).toBe("m5:s1")
  })

  it("tags vnodes without changing their identity or adding enumerable properties", () => {
    const vnode = m("button", { onclick: () => undefined }, "Save")
    const keysBefore = Object.keys(vnode)
    const attrKeysBefore = Object.keys(vnode.attrs as Record<string, unknown>)

    const tagged = source("m6:s1", vnode)

    expect(tagged).toBe(vnode)
    expect(Object.keys(vnode)).toEqual(keysBefore)
    expect(Object.keys(vnode.attrs as Record<string, unknown>)).toEqual(attrKeysBefore)
    expect(getSourceId(vnode)).toBe("m6:s1")
  })
})
