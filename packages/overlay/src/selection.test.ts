import type { ComponentId, SourceLocation } from "@mithril-inspector/protocol"
import { afterEach, describe, expect, it } from "vitest"

import { createSelectionModel, type SelectionResolver } from "./selection.js"

const source = (line: number): SourceLocation => ({
  moduleId: "m:abc",
  sourceId: `s${line}`,
  absoluteFile: "/project/src/UserCard.ts",
  relativeFile: "src/UserCard.ts",
  line,
  column: 3,
  kind: "element",
})

afterEach(() => {
  document.body.innerHTML = ""
})

/** Build `body > a > b > c > target`, all attached, returning each level. */
function buildTree(): { a: Element; b: Element; c: Element; target: Element } {
  const a = document.createElement("section")
  const b = document.createElement("div")
  const c = document.createElement("ul")
  const target = document.createElement("li")
  a.appendChild(b)
  b.appendChild(c)
  c.appendChild(target)
  document.body.appendChild(a)
  return { a, b, c, target }
}

describe("selection — happy path", () => {
  it("reports a connected, non-stale selection with a mapping", () => {
    const { target } = buildTree()
    const model = createSelectionModel()
    model.select(target, { source: source(17), componentId: "c:1" as ComponentId })

    const snap = model.snapshot()
    expect(model.hasSelection()).toBe(true)
    expect(snap.node).toBe(target)
    expect(snap.connected).toBe(true)
    expect(snap.stale).toBe(false)
    expect(snap.mapping.precision).toBe("exact")
    expect(snap.componentId).toBe("c:1")
  })

  it("clear() empties the selection", () => {
    const { target } = buildTree()
    const model = createSelectionModel()
    model.select(target, { source: source(1), componentId: null })
    model.clear()
    expect(model.hasSelection()).toBe(false)
    expect(model.snapshot().node).toBeNull()
  })

  it("returns an empty snapshot when nothing is selected", () => {
    const snap = createSelectionModel().snapshot()
    expect(snap.stale).toBe(false)
    expect(snap.mapping.precision).toBe("none")
  })
})

describe("selection — stale-node flow (§8.8)", () => {
  it("becomes stale but retains source/component when the node is removed", () => {
    const { c, target } = buildTree()
    const model = createSelectionModel()
    model.select(target, { source: source(17), componentId: "c:9" as ComponentId })

    c.removeChild(target) // redraw removed the node

    const snap = model.snapshot()
    expect(snap.connected).toBe(false)
    expect(snap.stale).toBe(true)
    // Record survives even though the DOM node is gone.
    expect(snap.source?.line).toBe(17)
    expect(snap.componentId).toBe("c:9")
    expect(snap.mapping.fileLine).toBe("src/UserCard.ts:17:3")
  })

  it("offers the nearest currently-mounted ancestor, skipping disconnected ones", () => {
    const { a, b, target } = buildTree()
    const model = createSelectionModel()
    model.select(target, { source: source(17), componentId: "c:9" as ComponentId })

    // Detach the b subtree: b, c and target are now disconnected; a stays mounted.
    a.removeChild(b)

    // The nearest ancestor of target is c (disconnected), then b (disconnected),
    // then a (still mounted) — the model must skip the first two and return a.
    expect(model.nearestMountedAncestor()).toBe(a)
  })

  it("promotes to the nearest mounted ancestor and re-resolves its mapping", () => {
    const { a, b, target } = buildTree()
    const resolve: SelectionResolver = (node) =>
      node === a
        ? { source: { ...source(4), kind: "component-view" }, componentId: "c:1" as ComponentId }
        : { source: null, componentId: null }
    const model = createSelectionModel(resolve)
    model.select(target, { source: source(17), componentId: "c:9" as ComponentId })

    a.removeChild(b)
    expect(model.promoteToNearestAncestor()).toBe(true)

    const snap = model.snapshot()
    expect(snap.node).toBe(a)
    expect(snap.connected).toBe(true)
    expect(snap.stale).toBe(false)
    expect(snap.componentId).toBe("c:1")
    expect(snap.mapping.precision).toBe("inferred")
  })

  it("still resolves body/html as a mounted ancestor when a subtree is detached", () => {
    // Removing `a` from body leaves body/html mounted — they remain valid
    // ancestors, so the nearest mounted ancestor is <body>, not null.
    const { a, target } = buildTree()
    const model = createSelectionModel()
    model.select(target, { source: source(1), componentId: null })
    document.body.removeChild(a)
    expect(model.nearestMountedAncestor()).toBe(document.body)
  })

  it("promoteToNearestAncestor returns false when no ancestor remains mounted", () => {
    // A wholly-detached tree (never attached to the document) has no mounted
    // ancestor at all.
    const a = document.createElement("section")
    const b = document.createElement("div")
    const target = document.createElement("li")
    a.appendChild(b)
    b.appendChild(target)
    const model = createSelectionModel()
    model.select(target, { source: source(1), componentId: null })

    expect(model.nearestMountedAncestor()).toBeNull()
    expect(model.promoteToNearestAncestor()).toBe(false)
    expect(model.snapshot().stale).toBe(true)
  })
})
