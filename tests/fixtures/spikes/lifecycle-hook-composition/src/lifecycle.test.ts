import m from "mithril"
import type { Component, Vnode, VnodeDOM } from "mithril"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createLifecycleRegistry } from "./lifecycle.js"
import type { ComponentId } from "./lifecycle.js"

let root: HTMLElement

beforeEach(() => {
  root = document.createElement("div")
  document.body.replaceChildren(root)
})

const idFor = (
  registry: ReturnType<typeof createLifecycleRegistry>,
  state: object | undefined,
): ComponentId => {
  if (state === undefined) throw new Error("no captured state")
  const id = registry.idOf(state)
  if (id === undefined) throw new Error("no instance id for state")
  return id
}

interface HookCall {
  self: unknown
  args: readonly unknown[]
}

interface HookCalls {
  oninit: HookCall[]
  oncreate: HookCall[]
  onbeforeupdate: HookCall[]
  onupdate: HookCall[]
  onbeforeremove: HookCall[]
  onremove: HookCall[]
}

describe("lifecycle hook composition", () => {
  it("invokes every application hook with the component state as `this` and the current vnode as argument", () => {
    const registry = createLifecycleRegistry()
    const calls: HookCalls = {
      oninit: [],
      oncreate: [],
      onbeforeupdate: [],
      onupdate: [],
      onbeforeremove: [],
      onremove: [],
    }
    const record =
      (name: keyof HookCalls) =>
      function (this: unknown, ...args: unknown[]): void {
        calls[name].push({ self: this, args })
      }

    const Box: Component = {
      oninit: record("oninit"),
      oncreate: record("oncreate"),
      onbeforeupdate: record("onbeforeupdate"),
      onupdate: record("onupdate"),
      onbeforeremove: record("onbeforeremove"),
      onremove: record("onremove"),
      view: () => m("div.box", "hi"),
    }
    const wrapped = registry.instrumentComponent("src:box", Box)

    const usage1 = m(wrapped)
    m.render(root, usage1)
    const state = usage1.state as object

    // oninit and oncreate fire once on first render, each bound to the state and
    // handed the component vnode.
    expect(calls.oninit).toHaveLength(1)
    expect(calls.oninit[0]?.self).toBe(state)
    expect(calls.oninit[0]?.args[0]).toBe(usage1)
    expect(calls.oncreate).toHaveLength(1)
    expect(calls.oncreate[0]?.self).toBe(state)
    expect(calls.oncreate[0]?.args[0]).toBe(usage1)

    // A second render of the same component at the same position is an update.
    const usage2 = m(wrapped)
    m.render(root, usage2)

    // onbeforeupdate receives (newVnode, oldVnode); onupdate receives the new vnode.
    expect(calls.onbeforeupdate).toHaveLength(1)
    expect(calls.onbeforeupdate[0]?.self).toBe(state)
    expect(calls.onbeforeupdate[0]?.args[0]).toBe(usage2)
    expect(calls.onbeforeupdate[0]?.args[1]).toBe(usage1)
    expect(calls.onupdate).toHaveLength(1)
    expect(calls.onupdate[0]?.self).toBe(state)
    expect(calls.onupdate[0]?.args[0]).toBe(usage2)

    // Removal: onbeforeremove then onremove, both bound to the same state.
    m.render(root, [])
    expect(calls.onbeforeremove).toHaveLength(1)
    expect(calls.onbeforeremove[0]?.self).toBe(state)
    expect(calls.onbeforeremove[0]?.args[0]).toBe(usage2)
    expect(calls.onremove).toHaveLength(1)
    expect(calls.onremove[0]?.self).toBe(state)
    expect(calls.onremove[0]?.args[0]).toBe(usage2)
  })

  it("passes an application onbeforeupdate returning false through unchanged, skipping the update", () => {
    const registry = createLifecycleRegistry()
    let allow = true
    const Counter: Component<{ n: number }> = {
      onbeforeupdate: () => allow,
      view: (vnode: Vnode<{ n: number }>) => m("span", String(vnode.attrs.n)),
    }
    const wrapped = registry.instrumentComponent("src:counter", Counter)

    m.render(root, m(wrapped, { n: 1 }))
    expect(root.textContent).toBe("1")

    // The application vetoes this update; the wrapper must return that `false`
    // and Mithril must skip the diff.
    allow = false
    m.render(root, m(wrapped, { n: 2 }))
    expect(root.textContent).toBe("1")

    // Allowing again lets the next update through.
    allow = true
    m.render(root, m(wrapped, { n: 3 }))
    expect(root.textContent).toBe("3")
  })

  it("keeps an async onbeforeremove intact: removal is delayed, the mapping is retained during the wait and cleaned in onremove", async () => {
    const registry = createLifecycleRegistry()
    let releaseRemoval = (): void => {}
    const removalBlocker = new Promise<void>((resolve) => {
      releaseRemoval = resolve
    })
    const onremoveSpy = vi.fn()
    const Async: Component = {
      onbeforeremove: () => removalBlocker,
      onremove: onremoveSpy,
      view: () => m("div.async", "x"),
    }
    const wrapped = registry.instrumentComponent("src:async", Async)

    const usage = m(wrapped)
    m.render(root, usage)
    const id = idFor(registry, usage.state as object)
    const node = root.querySelector("div.async") as Node

    expect(registry.isMapped(id)).toBe(true)
    expect(registry.liveCount()).toBe(1)

    // Trigger removal; the pending promise must keep the DOM attached.
    m.render(root, [])
    expect(node.isConnected).toBe(true)
    // §8.8: the record is retained while removal is pending (stale-selection UX).
    expect(registry.isMapped(id)).toBe(true)
    expect(onremoveSpy).not.toHaveBeenCalled()

    releaseRemoval()
    await removalBlocker
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Now the node detaches, the application onremove runs exactly once, and the
    // inspector's strong mappings are cleaned.
    expect(node.isConnected).toBe(false)
    expect(onremoveSpy).toHaveBeenCalledTimes(1)
    expect(registry.isMapped(id)).toBe(false)
    expect(registry.liveCount()).toBe(0)
  })

  it("propagates an exception thrown by an application hook unchanged", () => {
    const registry = createLifecycleRegistry()
    const boom = new Error("boom from oninit")
    const Exploding: Component = {
      oninit: () => {
        throw boom
      },
      view: () => m("div"),
    }
    const wrapped = registry.instrumentComponent("src:boom", Exploding)

    let caught: unknown
    try {
      m.render(root, m(wrapped))
    } catch (error) {
      caught = error
    }
    // The very same error object surfaces — not swallowed, not re-wrapped.
    expect(caught).toBe(boom)
  })

  it("cleans the inspector mapping even when the application onremove throws, and rethrows the error", () => {
    const registry = createLifecycleRegistry()
    const boom = new Error("boom from onremove")
    const Exploding: Component = {
      onremove: () => {
        throw boom
      },
      view: () => m("div.x"),
    }
    const wrapped = registry.instrumentComponent("src:boom2", Exploding)

    const usage = m(wrapped)
    m.render(root, usage)
    const id = idFor(registry, usage.state as object)
    expect(registry.isMapped(id)).toBe(true)

    let caught: unknown
    try {
      m.render(root, [])
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(boom)
    // Cleanup ran in the wrapper's `finally`, despite the application throw.
    expect(registry.isMapped(id)).toBe(false)
    expect(registry.liveCount()).toBe(0)
  })

  it("composes hooks that live on the component definition and on the vnode attrs, in Mithril's order", () => {
    const registry = createLifecycleRegistry()
    const order: string[] = []
    const Both: Component = {
      oncreate: () => order.push("def:oncreate"),
      onremove: () => order.push("def:onremove"),
      view: () => m("div.both"),
    }
    const wrapped = registry.instrumentComponent("src:both", Both)

    const usage = m(wrapped, {
      oncreate: () => order.push("attrs:oncreate"),
      onremove: () => order.push("attrs:onremove"),
    })
    m.render(root, usage)
    const id = idFor(registry, usage.state as object)
    expect(order).toEqual(["def:oncreate", "attrs:oncreate"])

    m.render(root, [])
    expect(order).toEqual([
      "def:oncreate",
      "attrs:oncreate",
      "def:onremove",
      "attrs:onremove",
    ])
    // The inspector cleanup still happened alongside both application hooks.
    expect(registry.isMapped(id)).toBe(false)
  })

  it("cleans the mapping on removal even when the component declares no lifecycle hooks", () => {
    const registry = createLifecycleRegistry()
    const Plain: Component = { view: () => m("p.plain", "plain") }
    const wrapped = registry.instrumentComponent("src:plain", Plain)

    const usage = m(wrapped)
    m.render(root, usage)
    const id = idFor(registry, usage.state as object)
    const node = root.querySelector("p.plain") as Node

    expect(registry.isMapped(id)).toBe(true)
    expect(registry.nodesOf(id)).toEqual([node])

    m.render(root, [])
    expect(registry.isMapped(id)).toBe(false)
    expect(registry.liveCount()).toBe(0)
    expect(registry.nodesOf(id)).toEqual([])
  })

  it("captures and cleans the full DomRange of a fragment-root component through the lifecycle hooks", () => {
    const registry = createLifecycleRegistry()
    const List: Component = {
      view: () => [m("li", "a"), m("li.mid", m("span", "b")), m("li", "c")],
    }
    const wrapped = registry.instrumentComponent("src:list", List)

    const usage = m(wrapped)
    m.render(root, usage)
    const id = idFor(registry, usage.state as object)

    const lis = Array.from(root.querySelectorAll("li"))
    expect(lis).toHaveLength(3)
    const range = registry.rangeOf(id)
    expect(range.first).toBe(lis[0])
    expect(range.last).toBe(lis[2])
    // Every top-level node of the fragment is captured for this instance.
    expect(registry.nodesOf(id)).toEqual(lis)

    m.render(root, [])
    // Removal drops the strong references (§8.8: no GC-preventing refs).
    expect(registry.rangeOf(id)).toEqual({ first: null, last: null })
    expect(registry.nodesOf(id)).toEqual([])
  })

  it("does not add inspector-owned properties to vnode.state nor mutate application attrs", () => {
    const registry = createLifecycleRegistry()
    interface Attrs {
      label: string
    }
    const Pure: Component<Attrs> = {
      view: (vnode: Vnode<Attrs>) => m("div", vnode.attrs.label),
    }
    const wrapped = registry.instrumentComponent("src:pure", Pure)

    const attrs: Attrs = { label: "hi" }
    const first = m(wrapped, attrs)
    m.render(root, first)
    const stateKeysAfterFirst = Object.keys(first.state as object)

    const second = m(wrapped, attrs)
    m.render(root, second)

    // Attrs pass through by identity; state gains no inspector own-properties
    // across redraws (a successful redraw also proves checkState never fired).
    expect(first.attrs).toBe(attrs)
    expect(second.attrs).toBe(attrs)
    expect(Object.keys(attrs)).toEqual(["label"])
    expect(Object.keys(second.state as object)).toEqual(stateKeysAfterFirst)
  })

  it("tracks multiple live instances of the same component independently and cleans only the removed one", () => {
    const registry = createLifecycleRegistry()
    const removed: ComponentId[] = []
    const Item: Component<{ label: string }> = {
      onremove: function (this: unknown, vnode: VnodeDOM<{ label: string }>) {
        const id = registry.idOf(vnode.state as object)
        if (id !== undefined) removed.push(id)
      },
      view: (vnode: Vnode<{ label: string }>) => m("li", vnode.attrs.label),
    }
    const wrapped = registry.instrumentComponent("src:item", Item)

    // Two sibling instances of the same component, keyed so identity is stable.
    const a = m(wrapped, { key: "a", label: "a" })
    const b = m(wrapped, { key: "b", label: "b" })
    m.render(root, [a, b])

    const idA = idFor(registry, a.state as object)
    const idB = idFor(registry, b.state as object)
    // Distinct instances get distinct ids and both are live.
    expect(idA).not.toBe(idB)
    expect(registry.liveCount()).toBe(2)
    expect(registry.isMapped(idA)).toBe(true)
    expect(registry.isMapped(idB)).toBe(true)

    // Remove only `a`; `b` survives with its mapping intact.
    m.render(root, [m(wrapped, { key: "b", label: "b" })])
    expect(removed).toEqual([idA])
    expect(registry.isMapped(idA)).toBe(false)
    expect(registry.isMapped(idB)).toBe(true)
    expect(registry.liveCount()).toBe(1)
    expect(registry.recordOf(idB)?.sourceId).toBe("src:item")
  })

  it("does not re-run the view or invoke application hooks more often than the application itself would", () => {
    const registry = createLifecycleRegistry()
    let views = 0
    const Counted: Component = {
      view: () => {
        views += 1
        return m("div.counted")
      },
    }
    const wrapped = registry.instrumentComponent("src:counted", Counted)

    m.render(root, m(wrapped)) // 1 view (create)
    m.render(root, m(wrapped)) // 2 views (update)
    m.render(root, m(wrapped)) // 3 views (update)
    // Instrumentation must not schedule extra redraws or re-render passes.
    expect(views).toBe(3)
  })
})
