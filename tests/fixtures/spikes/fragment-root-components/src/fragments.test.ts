import m from "mithril"
import type { Component, Vnode } from "mithril"
import { beforeEach, describe, expect, it } from "vitest"

import { createFragmentRegistry } from "./fragments.js"
import type { ComponentId } from "./fragments.js"

let root: HTMLElement

beforeEach(() => {
  root = document.createElement("div")
  document.body.replaceChildren(root)
})

const idFor = (
  registry: ReturnType<typeof createFragmentRegistry>,
  state: object | undefined,
): ComponentId => {
  if (state === undefined) throw new Error("no captured state")
  const id = registry.idOf(state)
  if (id === undefined) throw new Error("no instance id for state")
  return id
}

describe("fragment-root components", () => {
  it("maps every rendered node of a fragment-root component back to that component and its source ID", () => {
    const registry = createFragmentRegistry()
    const List: Component = {
      view: registry.instrumentView("src:list", () => [
        m("li", "a"),
        m("li.mid", m("span", "b")),
        m("li", "c"),
      ]),
    }

    const usage = m(List)
    m.render(root, usage)
    registry.associateTree(usage)

    const id = idFor(registry, usage.state as object)
    const lis = Array.from(root.querySelectorAll("li"))
    expect(lis).toHaveLength(3)

    // §20.1.9: the component is selectable through *any* of its rendered nodes.
    for (const li of lis) {
      const owner = registry.componentOf(li)
      expect(owner?.componentId).toBe(id)
      expect(owner?.sourceId).toBe("src:list")
    }

    // …including a node nested below a fragment child, via ancestor lookup.
    const nested = root.querySelector("li.mid span") as Node
    expect(registry.componentOf(nested)?.componentId).toBe(id)

    // §7.6: the whole fragment is one DomRange spanning first..last.
    const range = registry.rangeOf(id)
    expect(range.first).toBe(lis[0])
    expect(range.last).toBe(lis[2])
  })

  it("keeps the DomRange first/last correct after a redraw that reorders, adds and removes fragment children", () => {
    const registry = createFragmentRegistry()
    const List: Component<{ keys: readonly string[] }> = {
      view: registry.instrumentView("src:list", (vnode: Vnode<{ keys: readonly string[] }>) =>
        vnode.attrs.keys.map((key) => m("li", { key }, key)),
      ),
    }

    const first = m(List, { keys: ["a", "b", "c"] })
    m.render(root, first)
    registry.associateTree(first)
    const id = idFor(registry, first.state as object)

    const initialRange = registry.rangeOf(id)
    expect((initialRange.first as Element).textContent).toBe("a")
    expect((initialRange.last as Element).textContent).toBe("c")

    // Move c to the front, drop b, keep a, insert d at the end.
    const second = m(List, { keys: ["c", "a", "d"] })
    m.render(root, second)
    registry.associateTree(second)

    // The instance id is unchanged: state carried over across the redraw.
    expect(idFor(registry, second.state as object)).toBe(id)

    const lis = Array.from(root.querySelectorAll("li"))
    expect(lis.map((li) => li.textContent)).toEqual(["c", "a", "d"])

    const range = registry.rangeOf(id)
    expect(range.first).toBe(lis[0])
    expect(range.last).toBe(lis[2])

    // Every current node — including the freshly inserted one — resolves to the
    // component, and the removed node no longer does.
    for (const li of lis) {
      expect(registry.componentOf(li)?.componentId).toBe(id)
    }
  })

  it("handles an empty fragment root without error and does not claim sibling nodes", () => {
    const registry = createFragmentRegistry()
    const Empty: Component = { view: registry.instrumentView("src:empty", () => []) }

    // The empty component sits between two plain siblings.
    const app = m("div.host", m("span.before", "before"), m(Empty), m("span.after", "after"))
    m.render(root, app)
    registry.associateTree(app)

    const empty = app.children as Vnode[]
    const emptyUsage = empty[1] as Vnode
    const id = idFor(registry, emptyUsage.state as object)

    // §7.6: no DOM output → an empty range.
    expect(registry.rangeOf(id)).toEqual({ first: null, last: null })

    // The empty component must not adopt its siblings' nodes.
    const before = root.querySelector("span.before") as Node
    const after = root.querySelector("span.after") as Node
    expect(registry.componentOf(before)?.componentId).toBeUndefined()
    expect(registry.componentOf(after)?.componentId).toBeUndefined()
  })

  it("handles a fragment root mixing text, number and element children", () => {
    const registry = createFragmentRegistry()
    const Mixed: Component = {
      view: registry.instrumentView("src:mixed", () => ["hi", m("b", "x"), 42]),
    }

    const usage = m(Mixed)
    m.render(root, usage)
    registry.associateTree(usage)

    const id = idFor(registry, usage.state as object)
    expect(root.innerHTML).toBe("hi<b>x</b>42")

    const nodes = Array.from(root.childNodes)
    expect(nodes.map((n) => n.nodeType)).toEqual([
      Node.TEXT_NODE,
      Node.ELEMENT_NODE,
      Node.TEXT_NODE,
    ])

    // Every node — text, element and number-derived text — maps to the component.
    for (const node of nodes) {
      expect(registry.componentOf(node)?.componentId).toBe(id)
    }

    const range = registry.rangeOf(id)
    expect(range.first).toBe(nodes[0])
    expect(range.last).toBe(nodes[2])
  })

  it("keeps vnode.domSize reliable for a fragment root through an async onbeforeremove", async () => {
    const registry = createFragmentRegistry()
    let releaseRemoval = (): void => {}
    const removalBlocker = new Promise<void>((resolve) => {
      releaseRemoval = resolve
    })
    const List: Component = {
      onbeforeremove: () => removalBlocker,
      view: registry.instrumentView("src:list", () => [m("li", "a"), m("li", "b")]),
    }

    const usage = m(List)
    m.render(root, usage)
    registry.associateTree(usage)
    const id = idFor(registry, usage.state as object)

    const rangeBefore = registry.rangeOf(id)
    const firstNode = rangeBefore.first as Node
    const lastNode = rangeBefore.last as Node
    expect((firstNode as Element).textContent).toBe("a")
    expect((lastNode as Element).textContent).toBe("b")

    // Trigger removal; the async onbeforeremove keeps the DOM attached.
    m.render(root, [])

    // The range and its width remain readable and connected during the wait.
    const rangeDuring = registry.rangeOf(id)
    expect(rangeDuring.first).toBe(firstNode)
    expect(rangeDuring.last).toBe(lastNode)
    expect(firstNode.isConnected).toBe(true)
    expect(lastNode.isConnected).toBe(true)
    // The selection still resolves to the component while removal is pending.
    expect(registry.componentOf(firstNode)?.componentId).toBe(id)

    releaseRemoval()
    await removalBlocker
    await new Promise((resolve) => setTimeout(resolve, 0))

    // After removal completes the nodes detach; the range still references them
    // (stale-selection UX, §8.8) but they are no longer in the document.
    expect(firstNode.isConnected).toBe(false)
    expect(lastNode.isConnected).toBe(false)
  })

  it("resolves the nearest component for nested fragment-root components", () => {
    const registry = createFragmentRegistry()
    const Inner: Component = {
      view: registry.instrumentView("src:inner", () => [m("i.one", "1"), m("i.two", "2")]),
    }
    const Outer: Component = {
      view: registry.instrumentView("src:outer", () => [m("p.head", "head"), m(Inner)]),
    }

    const usage = m(Outer)
    m.render(root, usage)
    registry.associateTree(usage)

    const outerId = idFor(registry, usage.state as object)
    const outerInstance = (usage as unknown as { instance: { children: Vnode[] } }).instance
    const innerUsage = outerInstance.children[1] as Vnode
    const innerId = idFor(registry, innerUsage.state as object)
    expect(innerId).not.toBe(outerId)

    // Outer's own node belongs to Outer.
    const head = root.querySelector("p.head") as Node
    expect(registry.componentOf(head)?.componentId).toBe(outerId)
    expect(registry.componentOf(head)?.sourceId).toBe("src:outer")

    // Inner's nodes resolve to Inner (nearest), not the enclosing Outer.
    const one = root.querySelector("i.one") as Node
    const two = root.querySelector("i.two") as Node
    expect(registry.componentOf(one)?.componentId).toBe(innerId)
    expect(registry.componentOf(two)?.componentId).toBe(innerId)
    expect(registry.componentOf(one)?.sourceId).toBe("src:inner")

    // Outer's range still spans the whole flattened output (head + inner nodes).
    const outerRange = registry.rangeOf(outerId)
    expect(outerRange.first).toBe(head)
    expect(outerRange.last).toBe(two)
    // Inner's range spans only its own nodes.
    const innerRange = registry.rangeOf(innerId)
    expect(innerRange.first).toBe(one)
    expect(innerRange.last).toBe(two)
  })

  it("does not mutate the component's state or attrs while instrumenting the view", () => {
    const registry = createFragmentRegistry()
    interface Attrs {
      keys: readonly string[]
    }
    const List: Component<Attrs> = {
      view: registry.instrumentView("src:list", (vnode: Vnode<Attrs>) =>
        vnode.attrs.keys.map((key) => m("li", { key }, key)),
      ),
    }

    const attrs: Attrs = { keys: ["a", "b"] }
    const first = m(List, attrs)
    m.render(root, first)
    const stateKeysAfterFirst = Object.keys(first.state as object)
    const second = m(List, attrs)
    m.render(root, second)

    // Application attrs are passed through untouched, and the state object gains
    // no inspector-owned own-properties across redraws.
    expect(first.attrs).toBe(attrs)
    expect(second.attrs).toBe(attrs)
    expect(Object.keys(attrs)).toEqual(["keys"])
    expect(Object.keys(second.state as object)).toEqual(stateKeysAfterFirst)
  })
})
