import type { ComponentId } from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import { componentsWithMutatedDom, type DomMutationLike } from "./redraw-flash.js"

/** A minimal structural fake — real `MutationRecord`s have no public constructor. */
function record(target: Node, addedNodes: readonly Node[] = []): DomMutationLike {
  return { target, addedNodes }
}

describe("componentsWithMutatedDom — task 0030 attribution", () => {
  it("resolves a single attribute/text mutation's target to its owning component", () => {
    const span = document.createElement("span")
    const ids = componentsWithMutatedDom([record(span)], (node) => (node === span ? ("c:1" as ComponentId) : null))
    expect(ids).toEqual(new Set(["c:1"]))
  })

  it("returns an empty set when nothing resolves (e.g. a plain-DOM mutation outside any tracked component)", () => {
    const div = document.createElement("div")
    const ids = componentsWithMutatedDom([record(div)], () => null)
    expect(ids.size).toBe(0)
  })

  it("dedupes several mutations landing on the same component into one entry", () => {
    const a = document.createElement("span")
    const b = document.createElement("span")
    const ids = componentsWithMutatedDom([record(a), record(b)], () => "c:1" as ComponentId)
    expect(ids).toEqual(new Set(["c:1"]))
  })

  it("unions multiple independent components mutated within one batch, regardless of record order", () => {
    // A realistic batch: two unrelated mount roots each mutated in the same
    // frame, records interleaved rather than grouped per-root (§9.4-style
    // "don't assume caller ordering" — this repo's own multi-group TDD
    // guidance).
    const rootA1 = document.createElement("span")
    const rootB1 = document.createElement("span")
    const rootA2 = document.createElement("span")
    const rootB2 = document.createElement("span")
    const owner = new Map<Node, ComponentId>([
      [rootA1, "c:a" as ComponentId],
      [rootA2, "c:a" as ComponentId],
      [rootB1, "c:b" as ComponentId],
      [rootB2, "c:b" as ComponentId],
    ])
    const records = [record(rootB1), record(rootA1), record(rootA2), record(rootB2)]
    const ids = componentsWithMutatedDom(records, (node) => owner.get(node) ?? null)
    expect(ids).toEqual(new Set(["c:a", "c:b"]))
  })

  it("attributes a component's own root-node replacement to the component itself, not only to its parent (childList target)", () => {
    // Simulates a redraw where a component's view() returns a different root
    // tag: Mithril's diff removes the old node and inserts a new one as a
    // child of the component's *parent* — the childList mutation's `target`
    // is the parent's own DOM node, not the component's (now-detached) old
    // node. Resolving only on `target` would miss the replaced component
    // entirely (its own identity changed, but that's invisible at `target`).
    // The parent legitimately flashes too — its own node's childList really
    // did change — so both are expected, not just the child.
    const parentNode = document.createElement("div")
    const newChild = document.createElement("section")
    const owner = new Map<Node, ComponentId>([
      [parentNode, "parent-component" as ComponentId],
      [newChild, "child-component" as ComponentId],
    ])
    const ids = componentsWithMutatedDom(
      [record(parentNode, [newChild])],
      (node) => owner.get(node) ?? null,
    )
    expect(ids).toEqual(new Set(["parent-component", "child-component"]))
  })

  it("still flashes the parent for an ordinary content mutation with no addedNodes resolving to a component (e.g. inserting a plain <li>)", () => {
    const list = document.createElement("ul")
    const li = document.createElement("li")
    const owner = new Map<Node, ComponentId>([[list, "list-component" as ComponentId]])
    const ids = componentsWithMutatedDom([record(list, [li])], (node) => owner.get(node) ?? null)
    expect(ids).toEqual(new Set(["list-component"]))
  })

  it("returns an empty set for an empty batch", () => {
    expect(componentsWithMutatedDom([], () => "c:1" as ComponentId).size).toBe(0)
  })
})
