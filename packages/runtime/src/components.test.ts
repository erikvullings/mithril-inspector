import m from "mithril"
import type { Component, Vnode } from "mithril"
import type { ComponentId, ModuleId, RuntimeEvent } from "@mithril-inspector/protocol"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createComponentRegistry } from "./components.js"
import { createSourceRegistry } from "./source-registry.js"

const MODULE: ModuleId = "m:src/App.ts"

let root: HTMLElement

beforeEach(() => {
  root = document.createElement("div")
  document.body.replaceChildren(root)
})

type Mode = "source" | "components" | "full"

const setup = (opts: { events?: RuntimeEvent[]; mode?: Mode } = {}) => {
  const sources = createSourceRegistry()
  sources.registerModule(MODULE, {
    file: "/project/src/App.ts",
    relativeFile: "src/App.ts",
    sources: {
      s1: { line: 3, column: 1, kind: "component-declaration", displayName: "App" },
      s2: { line: 8, column: 1, kind: "component-declaration", displayName: "Row" },
    },
  })
  const registry = createComponentRegistry(sources, {
    ...(opts.events ? { emit: (e: RuntimeEvent) => opts.events!.push(e) } : {}),
    ...(opts.mode ? { getMode: () => opts.mode! } : {}),
  })
  return { sources, registry }
}

const idOf = (registry: ReturnType<typeof createComponentRegistry>, state: object | undefined): ComponentId => {
  if (state === undefined) throw new Error("no state captured")
  const id = registry.idOf(state)
  if (id === undefined) throw new Error("no id for state")
  return id
}

describe("createComponentRegistry", () => {
  it("tracks a mounted object component with a stable id, kind and display name", () => {
    const { registry } = setup()
    const App = registry.instrument(`${MODULE}:s1`, { view: () => m("div.app", "hi") } as Component)
    const usage = m(App)
    m.render(root, usage)
    registry.flush()

    const id = idOf(registry, usage.state as object)
    const record = registry.recordOf(id)
    expect(record?.kind).toBe("object")
    expect(record?.mounted).toBe(true)
    expect(record?.displayName).toBe("App")
    expect(registry.displayNameOf(id)).toBe("App")

    // Id is stable across a redraw.
    m.render(root, m(App))
    expect(registry.idOf(usage.state as object)).toBe(id)
  })

  it("reports kind: anonymous for an inline object component with no resolvable name (§2.4)", () => {
    const { registry } = setup()
    // No qualifiedId (mirrors §6.5 inline `m({ view: ... })` usage where the
    // transform found no variable/export name), no `.displayName` override.
    const Inline = registry.instrument("", { view: () => m("div.inline") } as Component)
    const usage = m(Inline)
    m.render(root, usage)
    registry.flush()

    const id = idOf(registry, usage.state as object)
    const record = registry.recordOf(id)
    expect(record?.kind).toBe("anonymous")
    expect(record?.displayName).toBe("Anonymous")
    expect(record?.displayNameInferred).toBe(true)
  })

  it("invokes every application hook with `this === state` and preserves return values", () => {
    const { registry } = setup()
    interface HookLog {
      self: unknown
      args: unknown[]
    }
    type HookName = "oninit" | "oncreate" | "onbeforeupdate" | "onupdate" | "onbeforeremove" | "onremove"
    const calls: Record<HookName, HookLog[]> = {
      oninit: [],
      oncreate: [],
      onbeforeupdate: [],
      onupdate: [],
      onbeforeremove: [],
      onremove: [],
    }
    const rec = (name: HookName) =>
      function (this: unknown, ...args: unknown[]): void {
        calls[name].push({ self: this, args })
      }
    let skipUpdate = false
    const Box: Component = {
      oninit: rec("oninit"),
      oncreate: rec("oncreate"),
      onbeforeupdate: function (this: unknown, ...a: unknown[]) {
        calls.onbeforeupdate.push({ self: this, args: a })
        return skipUpdate ? false : undefined
      },
      onupdate: rec("onupdate"),
      onbeforeremove: rec("onbeforeremove"),
      onremove: rec("onremove"),
      view: () => m("div"),
    }
    const Instrumented = registry.instrument(`${MODULE}:s1`, Box)
    const usage = m(Instrumented)
    m.render(root, usage)
    const state = usage.state as object

    expect(calls.oninit).toHaveLength(1)
    expect(calls.oncreate).toHaveLength(1)
    expect(calls.oninit[0]!.self).toBe(state)
    expect(calls.oncreate[0]!.self).toBe(state)

    // A normal redraw runs onbeforeupdate (proceed) then onupdate.
    m.render(root, m(Instrumented))
    expect(calls.onbeforeupdate).toHaveLength(1)
    expect(calls.onupdate).toHaveLength(1)

    // onbeforeupdate returning false is forwarded and skips the update.
    skipUpdate = true
    m.render(root, m(Instrumented))
    expect(calls.onbeforeupdate).toHaveLength(2)
    expect(calls.onupdate).toHaveLength(1) // no new onupdate

    // Removal fires onbeforeremove then onremove.
    m.render(root, [])
    expect(calls.onbeforeremove).toHaveLength(1)
    expect(calls.onremove).toHaveLength(1)
  })

  it("preserves an async onbeforeremove delay and cleans the mapping only on onremove", async () => {
    const { registry } = setup()
    let resolveRemoval: (() => void) | undefined
    const Async: Component = {
      onbeforeremove: () => new Promise<void>((resolve) => (resolveRemoval = resolve)),
      view: () => m("div.async"),
    }
    const Instrumented = registry.instrument(`${MODULE}:s1`, Async)
    const usage = m(Instrumented)
    m.render(root, usage)
    registry.flush()
    const id = idOf(registry, usage.state as object)

    m.render(root, [])
    // The async hook has not resolved: DOM stays and the mapping is retained.
    expect(root.querySelector("div.async")).not.toBeNull()
    expect(registry.isMapped(id)).toBe(true)

    resolveRemoval?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(root.querySelector("div.async")).toBeNull()
    expect(registry.isMapped(id)).toBe(false)
    // Weakly retained for stale selection: idOf still resolves after unmount.
    expect(registry.idOf(usage.state as object)).toBe(id)
  })

  it("propagates an exception thrown by an application hook and still cleans up", () => {
    const { registry } = setup()
    const boom = new Error("boom")
    const Throwy: Component = {
      onremove: () => {
        throw boom
      },
      view: () => m("div"),
    }
    const Instrumented = registry.instrument(`${MODULE}:s1`, Throwy)
    const usage = m(Instrumented)
    m.render(root, usage)
    const id = idOf(registry, usage.state as object)
    expect(() => m.render(root, [])).toThrow(boom)
    // Cleanup ran in `finally` despite the throw.
    expect(registry.isMapped(id)).toBe(false)
  })

  it("reports the DOM range for element and fragment-root components", () => {
    const { registry } = setup()
    const El = registry.instrument(`${MODULE}:s1`, { view: () => m("div.solo") } as Component)
    const usageEl = m(El)
    m.render(root, usageEl)
    registry.flush()
    const elId = idOf(registry, usageEl.state as object)
    const elRange = registry.rangeOf(elId)
    expect(elRange.first).toBe(root.querySelector("div.solo"))
    expect(elRange.first).toBe(elRange.last)

    const other = document.createElement("div")
    document.body.appendChild(other)
    const Frag = registry.instrument(`${MODULE}:s2`, {
      view: () => [m("p.one", "1"), m("p.two", "2")],
    } as Component)
    const usageFrag = m(Frag)
    m.render(other, usageFrag)
    registry.flush()
    const fragId = idOf(registry, usageFrag.state as object)
    const fragRange = registry.rangeOf(fragId)
    expect(fragRange.first).toBe(other.querySelector("p.one"))
    expect(fragRange.last).toBe(other.querySelector("p.two"))
  })

  it("resolves nested components innermost-first and links parent/child (§9.1)", () => {
    const { registry } = setup()
    const Row = registry.instrument(`${MODULE}:s2`, {
      view: () => m("span.row", "row"),
    } as Component)
    const App = registry.instrument(`${MODULE}:s1`, {
      view: () => m("div.app", m(Row)),
    } as Component)
    const appUsage = m(App)
    m.render(root, appUsage)
    registry.flush()

    const appId = idOf(registry, appUsage.state as object)
    const rowNode = root.querySelector("span.row")!
    const appNode = root.querySelector("div.app")!

    const rowId = registry.resolveDomComponent(rowNode)
    expect(rowId).not.toBeNull()
    expect(rowId).not.toBe(appId)
    // The outer div (not under Row's range) resolves to App.
    expect(registry.resolveDomComponent(appNode)).toBe(appId)

    // Parent/child linkage.
    const rowRecord = registry.recordOf(rowId!)
    expect(rowRecord?.parentId).toBe(appId)
    expect(registry.recordOf(appId)?.childIds).toContain(rowId)
  })

  it("rebuilds childIds in render order on every flush, not creation order (ADR-103 follow-up)", () => {
    const { registry } = setup()
    const Item: Component<{ label: string }> = { view: (vnode) => m("li", vnode.attrs.label) }
    const InstrumentedItem = registry.instrument(`${MODULE}:s2`, Item)
    const List: Component<{ order: string[] }> = {
      view: (vnode) =>
        m(
          "ul",
          vnode.attrs.order.map((label) => m(InstrumentedItem, { key: label, label })),
        ),
    }
    const InstrumentedList = registry.instrument(`${MODULE}:s1`, List)

    // Creation order a, b, c.
    const listUsage = m(InstrumentedList, { order: ["a", "b", "c"] })
    m.render(root, listUsage)
    registry.flush()
    const listId = idOf(registry, listUsage.state as object)
    const itemNodes = () => Array.from(root.querySelectorAll("li")).map((el) => el.textContent)
    expect(itemNodes()).toEqual(["a", "b", "c"])

    const idByLabel = new Map<string, ComponentId>()
    for (const li of Array.from(root.querySelectorAll("li"))) {
      const id = registry.resolveDomComponent(li)
      idByLabel.set(li.textContent ?? "", id!)
    }
    const creationOrderIds = registry.recordOf(listId)?.childIds
    expect(creationOrderIds).toEqual([idByLabel.get("a"), idByLabel.get("b"), idByLabel.get("c")])

    // Re-render with the same keyed items in a different (interleaved) order —
    // no new allocations, same state objects, only the render position moves.
    m.render(root, m(InstrumentedList, { order: ["c", "a", "b"] }))
    registry.flush()
    expect(itemNodes()).toEqual(["c", "a", "b"])
    const renderOrderIds = registry.recordOf(listId)?.childIds
    expect(renderOrderIds).toEqual([idByLabel.get("c"), idByLabel.get("a"), idByLabel.get("b")])
  })

  it("distinguishes multiple roots mounting the same component object (§3.1)", () => {
    const { registry } = setup()
    const App = registry.instrument(`${MODULE}:s1`, { view: () => m("div.app") } as Component)
    const rootB = document.createElement("div")
    document.body.appendChild(rootB)

    const a = m(App)
    const b = m(App)
    m.render(root, a)
    m.render(rootB, b)
    registry.flush()

    const idA = idOf(registry, a.state as object)
    const idB = idOf(registry, b.state as object)
    expect(idA).not.toBe(idB)
    expect(registry.liveCount()).toBe(2)
  })

  it("instruments a closure component and preserves its captured state", () => {
    const { registry } = setup()
    const Counter = registry.instrument(`${MODULE}:s1`, () => {
      let n = 0
      return {
        view: () => {
          n += 1
          return m("div.count", String(n))
        },
      }
    })
    const usage = m(Counter as unknown as Component)
    m.render(root, usage)
    registry.flush()
    const id = idOf(registry, usage.state as object)
    expect(registry.recordOf(id)?.kind).toBe("closure")
    expect(root.querySelector("div.count")?.textContent).toBe("1")

    m.render(root, m(Counter as unknown as Component))
    expect(root.querySelector("div.count")?.textContent).toBe("2")
  })

  it("preserves `this`-accessed helper methods and does not add own state keys (§2.3)", () => {
    const { registry } = setup()
    let greeting = ""
    const WithHelper = {
      greet(this: { name: string }) {
        return `hi ${this.name}`
      },
      name: "world",
      view(this: { greet: () => string }) {
        greeting = this.greet()
        return m("div")
      },
    }
    const stateKeysBefore: string[] = []
    const Instrumented = registry.instrument(`${MODULE}:s1`, WithHelper as unknown as Component)
    const usage = m(Instrumented) as Vnode<unknown, Record<string, unknown>>
    m.render(root, usage)
    // The helper resolved through the prototype chain.
    expect(greeting).toBe("hi world")
    // The instance state gained no inspector own-properties.
    expect(Object.getOwnPropertyNames(usage.state as object)).toEqual(stateKeysBefore)
  })

  it("cleans mappings on removal and drops the strong record", () => {
    const { registry } = setup()
    const App = registry.instrument(`${MODULE}:s1`, { view: () => m("div") } as Component)
    const usage = m(App)
    m.render(root, usage)
    registry.flush()
    const id = idOf(registry, usage.state as object)
    expect(registry.isMapped(id)).toBe(true)
    expect(registry.liveCount()).toBe(1)

    m.render(root, [])
    expect(registry.isMapped(id)).toBe(false)
    expect(registry.liveCount()).toBe(0)
    expect(registry.recordOf(id)).toBeUndefined()
  })

  it("honours display-name override, hidden and serializer settings (§14)", () => {
    const { registry } = setup()
    const def = { view: () => m("div") } as Component
    const serializer = { attrs: (a: unknown) => a }
    registry.setDisplayName(def, "Custom")
    registry.markHidden(def)
    registry.setSerializer(def, serializer)
    const App = registry.instrument(`${MODULE}:s1`, def)
    const usage = m(App)
    m.render(root, usage)
    const id = idOf(registry, usage.state as object)

    expect(registry.displayNameOf(id)).toBe("Custom")
    expect(registry.isHidden(def)).toBe(true)
    expect(registry.serializerOf(def)).toBe(serializer)
  })

  it("excludes a hidden component and its subtree from recordOf/componentsSnapshot (§14)", () => {
    const { registry } = setup()
    const Row: Component = { view: () => m("span.row", "row") }
    const InstrumentedRow = registry.instrument(`${MODULE}:s2`, Row)
    const rowUsage = m(InstrumentedRow)
    const hiddenDef: Component = { view: () => m("div.hidden-wrapper", rowUsage) }
    registry.markHidden(hiddenDef)
    const Hidden = registry.instrument(`${MODULE}:s1`, hiddenDef)
    const hiddenUsage = m(Hidden)
    // App (not hidden) owns Hidden (hidden), which owns Row (not hidden
    // itself, but inside a hidden subtree).
    const App: Component = { view: () => m("div.app", hiddenUsage) }
    const InstrumentedApp = registry.instrument("", App)
    const appUsage = m(InstrumentedApp)
    m.render(root, appUsage)
    registry.flush()

    const appId = idOf(registry, appUsage.state as object)
    const hiddenId = idOf(registry, hiddenUsage.state as object)
    const rowId = idOf(registry, rowUsage.state as object)

    expect(registry.recordOf(appId)).not.toBeUndefined()
    // The hidden instance itself, and anything transitively owned by it
    // (Row), are excluded from records — even though their ids still exist
    // internally (tracking stays uniform; only the read boundary filters).
    expect(registry.recordOf(hiddenId)).toBeUndefined()
    expect(registry.recordOf(rowId)).toBeUndefined()

    const snapshot = registry.componentsSnapshot()
    expect(snapshot.has(appId)).toBe(true)
    expect(snapshot.has(hiddenId)).toBe(false)
    expect(snapshot.has(rowId)).toBe(false)
  })

  it("resolveDomComponent skips a hidden owner, resolving to the nearest visible ancestor (§14)", () => {
    const { registry } = setup()
    const Row: Component = { view: () => m("span.row", "row") }
    const InstrumentedRow = registry.instrument(`${MODULE}:s2`, Row)
    const hiddenDef: Component = { view: () => m("div.hidden-wrapper", m(InstrumentedRow)) }
    registry.markHidden(hiddenDef)
    const Hidden = registry.instrument(`${MODULE}:s1`, hiddenDef)
    const App: Component = { view: () => m("div.app", m(Hidden)) }
    const InstrumentedApp = registry.instrument("", App)
    const appUsage = m(InstrumentedApp)
    m.render(root, appUsage)
    registry.flush()

    const appId = idOf(registry, appUsage.state as object)
    const rowNode = root.querySelector("span.row")!
    // Row's own nearest owner is Hidden, which is excluded — resolution must
    // continue outward to App instead of returning null.
    expect(registry.resolveDomComponent(rowNode)).toBe(appId)
  })

  it("emits batched components-added and components-removed events on flush", () => {
    const events: RuntimeEvent[] = []
    const { registry } = setup({ events })
    const App = registry.instrument(`${MODULE}:s1`, { view: () => m("div") } as Component)
    m.render(root, m(App))
    registry.flush()
    m.render(root, [])
    registry.flush()

    const added = events.find((e) => e.type === "components-added")
    const removed = events.find((e) => e.type === "components-removed")
    expect(added?.type).toBe("components-added")
    expect(removed?.type).toBe("components-removed")
  })

  it("runs the application view exactly once per render pass (no extra redraw)", () => {
    const { registry } = setup()
    const view = vi.fn(() => m("div"))
    const App = registry.instrument(`${MODULE}:s1`, { view } as Component)
    m.render(root, m(App))
    expect(view).toHaveBeenCalledTimes(1)
    m.render(root, m(App))
    expect(view).toHaveBeenCalledTimes(2)
  })
})

describe("mode gating (§17, task 0017)", () => {
  it("keeps object and closure components tracked in mode: source (regression guard for the shipped v0.1.0-alpha.1)", () => {
    const { registry } = setup({ mode: "source" })
    const ObjApp = registry.instrument(`${MODULE}:s1`, { view: () => m("div.obj") } as Component)
    const usage = m(ObjApp)
    m.render(root, usage)
    registry.flush()
    expect(idOf(registry, usage.state as object)).toBeDefined()
    expect(registry.recordOf(idOf(registry, usage.state as object))?.kind).toBe("object")

    const Closure = registry.instrument(`${MODULE}:s2`, () => ({ view: () => m("div.closure") }))
    const closureUsage = m(Closure as unknown as Component)
    m.render(root, [usage, closureUsage])
    registry.flush()
    expect(idOf(registry, closureUsage.state as object)).toBeDefined()
  })

  it("defaults to mode: source when no getMode option is given", () => {
    const { registry } = setup()
    const App = registry.instrument(`${MODULE}:s1`, { view: () => m("div") } as Component)
    const usage = m(App)
    m.render(root, usage)
    expect(idOf(registry, usage.state as object)).toBeDefined()
  })
})

describe("class components (ADR-103 prototype facade, task 0017)", () => {
  it("is inert in mode: source — the class is left completely unwrapped", () => {
    const { registry } = setup({ mode: "source" })
    class Widget implements Component {
      view() {
        return m("div.widget")
      }
    }
    // Registered for its side effect only, exactly as the transform's
    // discarded-return declaration-form registration call would (the return
    // is never used at real `m(Widget)` call sites for a declaration).
    registry.instrument(`${MODULE}:s1`, Widget)
    const usage = m(Widget)
    m.render(root, usage)
    expect(registry.idOf(usage.state as object)).toBeUndefined()
  })

  it("tracks a class component in mode: components, preserving instanceof/constructor and stable id", () => {
    const { registry } = setup({ mode: "components" })
    class Widget implements Component {
      calls: string[] = []
      view() {
        this.calls.push("view")
        return m("div.widget")
      }
    }
    registry.instrument(`${MODULE}:s1`, Widget)
    const usage = m(Widget)
    m.render(root, usage)
    registry.flush()

    const state = usage.state as Widget
    expect(state).toBeInstanceOf(Widget)
    expect(state.constructor).toBe(Widget)
    expect(state.calls).toEqual(["view"])

    const id = idOf(registry, usage.state as object)
    const record = registry.recordOf(id)
    expect(record?.kind).toBe("class")
    expect(record?.mounted).toBe(true)

    // Stable across a redraw — same prototype facade, same identity.
    m.render(root, m(Widget))
    expect(registry.idOf(usage.state as object)).toBe(id)
  })

  it("works identically for a const-bound class expression, not just a declaration", () => {
    const { registry } = setup({ mode: "components" })
    const Widget = class implements Component {
      view() {
        return m("div.expr")
      }
    }
    registry.instrument(`${MODULE}:s1`, Widget)
    const usage = m(Widget)
    m.render(root, usage)
    registry.flush()
    expect(idOf(registry, usage.state as object)).toBeDefined()
    expect(registry.recordOf(idOf(registry, usage.state as object))?.kind).toBe("class")
  })

  it("invokes every application hook with the class instance as `this` and preserves return values", () => {
    const { registry } = setup({ mode: "components" })
    const calls: Record<string, unknown[]> = {
      oninit: [],
      oncreate: [],
      onbeforeupdate: [],
      onupdate: [],
      onbeforeremove: [],
      onremove: [],
    }
    class Widget implements Component {
      oninit(this: unknown) {
        calls.oninit!.push(this)
      }
      oncreate(this: unknown) {
        calls.oncreate!.push(this)
      }
      onbeforeupdate(this: unknown) {
        calls.onbeforeupdate!.push(this)
        return undefined
      }
      onupdate(this: unknown) {
        calls.onupdate!.push(this)
      }
      onbeforeremove(this: unknown) {
        calls.onbeforeremove!.push(this)
        return undefined
      }
      onremove(this: unknown) {
        calls.onremove!.push(this)
      }
      view() {
        return m("div")
      }
    }
    registry.instrument(`${MODULE}:s1`, Widget)
    const usage = m(Widget)
    m.render(root, usage)
    const state = usage.state as object
    expect(calls.oninit).toEqual([state])
    expect(calls.oncreate).toEqual([state])
    // oninit already allocated the registry's own record (ADR-105 timing).
    const id = idOf(registry, state)

    m.render(root, m(Widget))
    expect(calls.onbeforeupdate).toEqual([state])
    expect(calls.onupdate).toEqual([state])
    expect(registry.recordOf(id)?.updateCount).toBe(1)

    m.render(root, [])
    expect(calls.onbeforeremove).toEqual([state])
    expect(calls.onremove).toEqual([state])
    // The registry's own mapping is cleaned in onremove, same as object/closure.
    expect(registry.isMapped(id)).toBe(false)
  })

  it("links parent/child for nested class components", () => {
    const { registry } = setup({ mode: "components" })
    class Row implements Component {
      view() {
        return m("span.row")
      }
    }
    class App implements Component {
      view() {
        return m("div.app", m(Row))
      }
    }
    registry.instrument(`${MODULE}:s2`, Row)
    registry.instrument(`${MODULE}:s1`, App)
    const appUsage = m(App)
    m.render(root, appUsage)
    registry.flush()

    const appId = idOf(registry, appUsage.state as object)
    const rowNode = root.querySelector("span.row")!
    const rowId = registry.resolveDomComponent(rowNode)
    expect(rowId).not.toBeNull()
    expect(registry.recordOf(rowId!)?.parentId).toBe(appId)
    expect(registry.recordOf(appId)?.childIds).toContain(rowId)
  })
})

// Confirmed against mithril/api/router.js: `RouterRoot.view()` calls
// `currentResolver.render(vnode)` directly (a plain method call, `this` =
// the resolver) whenever a route table entry has `render` and no `view` —
// there are no other lifecycle hooks on a resolver, and it has no
// `vnode.state` of its own (Mithril never `new`s or factory-calls it).
interface RouteResolverDef {
  render: (this: unknown, vnode: unknown) => unknown
}

describe("route-resolvers (task 0017, runtime-only per {render} shape)", () => {
  it("is inert (unwrapped, untracked) in mode: source", () => {
    const { registry } = setup({ mode: "source" })
    const resolverDef: RouteResolverDef = { render: () => m("div.page") }
    const resolver = registry.instrument(`${MODULE}:s1`, resolverDef)
    expect(resolver).toBe(resolverDef)
  })

  it("tracks a route-resolver as a root instance with kind: route-resolver, in mode: components", () => {
    const { registry } = setup({ mode: "components" })
    const resolverDef: RouteResolverDef = { render: () => m("div.page", "hello") }
    const resolver = registry.instrument(`${MODULE}:s1`, resolverDef)
    expect(resolver).not.toBe(resolverDef)

    // Simulate RouterRoot.view(): `return currentResolver.render(vnode)`,
    // then Mithril mounts whatever render() returns.
    const output = resolver.render({ attrs: {} })
    m.render(root, output as ReturnType<typeof m>)
    registry.flush()

    const id = idOf(registry, resolver as object)
    const record = registry.recordOf(id)
    expect(record?.kind).toBe("route-resolver")
    expect(record?.parentId).toBeNull()
    expect(record?.mounted).toBe(true)
    expect(registry.rangeOf(id).first).toBe(root.querySelector("div.page"))
  })

  it("attributes a nested tracked component's parentId to the resolver (realistic m.route() usage)", () => {
    const { registry } = setup({ mode: "components" })
    const Page = registry.instrument(`${MODULE}:s2`, { view: () => m("section.page", "content") } as Component)
    const resolverDef: RouteResolverDef = { render: () => m(Page) }
    const resolver = registry.instrument(`${MODULE}:s1`, resolverDef)

    const output = resolver.render({ attrs: {} }) as ReturnType<typeof m>
    m.render(root, output as ReturnType<typeof m>)
    registry.flush()

    const resolverId = idOf(registry, resolver as object)
    const pageId = idOf(registry, (output as unknown as { state: object }).state)
    expect(registry.recordOf(pageId)?.parentId).toBe(resolverId)
    expect(registry.recordOf(resolverId)?.childIds).toContain(pageId)
  })

  it("persists across repeated render() calls — a resolver has no unmount signal", () => {
    const { registry } = setup({ mode: "components" })
    const resolverDef: RouteResolverDef = { render: () => m("div.page", "v1") }
    const resolver = registry.instrument(`${MODULE}:s1`, resolverDef)
    m.render(root, resolver.render({ attrs: {} }) as ReturnType<typeof m>)
    registry.flush()
    const id = idOf(registry, resolver as object)

    // The route changes away and back — the same resolver object gets
    // called again; the same instance id stays mounted throughout.
    m.render(root, resolver.render({ attrs: {} }) as ReturnType<typeof m>)
    registry.flush()
    expect(registry.idOf(resolver as object)).toBe(id)
    expect(registry.recordOf(id)?.mounted).toBe(true)
  })
})

describe("function-declaration closures — a known, permanent limitation (task 0017)", () => {
  it("wrapping a bare function reference is inert once Mithril calls the original, unrebound binding", () => {
    const { registry } = setup()
    function Widget() {
      return { view: () => m("div.widget") }
    }
    // `instrument()` is still called (the transform emits a registration
    // statement even for declarations) but its return is discarded — real
    // `m(Widget)` usage always resolves through the ORIGINAL, untouched
    // `Widget` binding, since a `function` declaration can't be rebound the
    // way `const Widget = () => {...}` can (§9.2, runtime README "Known
    // Phase 1 limitations"). No heuristic distinguishes the two forms from
    // a bare function reference alone (both can carry a `.name`), so this
    // can't be detected and worked around at the runtime layer.
    registry.instrument(`${MODULE}:s1`, Widget)
    const usage = m(Widget as unknown as Component)
    m.render(root, usage)
    registry.flush()

    // No instance is ever tracked: the runtime has no reference to whatever
    // `instrument()` returned, and there is no way to intercept calls to a
    // bare function reference without either global-`m` interception
    // (forbidden, ADR-005) or a transform-side call-site rewrite (out of
    // this task's runtime-only scope).
    expect(registry.idOf(usage.state as object)).toBeUndefined()
  })

  it("instrument()'s return, if actually bound at the call site, does track — the gap is call-site binding, not the wrapping mechanism", () => {
    const { registry } = setup()
    function Widget() {
      return { view: () => m("div.widget") }
    }
    const Wrapped = registry.instrument(`${MODULE}:s1`, Widget)
    // Using the wrapped reference (as a `const X = <expr>` binding could)
    // tracks correctly, confirming the limitation above is specifically
    // about declaration-form bindings the transform can't rebind.
    const usage = m(Wrapped as unknown as Component)
    m.render(root, usage)
    expect(registry.idOf(usage.state as object)).toBeDefined()
  })
})

describe("keyed reorder identity (task 0017)", () => {
  it("keeps each item's ComponentId attached to its own state object across an interleaved move + insert + remove, not screen position", () => {
    const { registry } = setup()
    const Item: Component<{ label: string }> = { view: (vnode) => m("li", vnode.attrs.label) }
    const InstrumentedItem = registry.instrument(`${MODULE}:s2`, Item)
    const List: Component<{ order: string[] }> = {
      view: (vnode) =>
        m(
          "ul",
          vnode.attrs.order.map((label) => m(InstrumentedItem, { key: label, label })),
        ),
    }
    const InstrumentedList = registry.instrument(`${MODULE}:s1`, List)

    m.render(root, m(InstrumentedList, { order: ["a", "b", "c", "d"] }))
    registry.flush()
    const idByLabel = new Map<string, ComponentId>()
    for (const li of Array.from(root.querySelectorAll("li"))) {
      idByLabel.set(li.textContent ?? "", registry.resolveDomComponent(li)!)
    }
    expect([...idByLabel.keys()]).toEqual(["a", "b", "c", "d"])

    // One redraw that simultaneously: removes "b", inserts new item "e"
    // between "a" and "c", and moves "d" to the front — not a simple
    // pairwise swap.
    m.render(root, m(InstrumentedList, { order: ["d", "a", "e", "c"] }))
    registry.flush()

    const idByLabelAfter = new Map<string, ComponentId>()
    for (const li of Array.from(root.querySelectorAll("li"))) {
      idByLabelAfter.set(li.textContent ?? "", registry.resolveDomComponent(li)!)
    }
    expect([...idByLabelAfter.keys()]).toEqual(["d", "a", "e", "c"])

    // Surviving items kept their id — identity follows the state object
    // (Mithril's own keyed-diff carryover), not the DOM/render position.
    expect(idByLabelAfter.get("a")).toBe(idByLabel.get("a"))
    expect(idByLabelAfter.get("c")).toBe(idByLabel.get("c"))
    expect(idByLabelAfter.get("d")).toBe(idByLabel.get("d"))
    // The new item got a fresh id, distinct from every surviving one.
    expect(idByLabelAfter.get("e")).not.toBe(undefined)
    expect([...idByLabel.values()]).not.toContain(idByLabelAfter.get("e"))
    // The removed item's id is no longer live.
    expect(registry.isMapped(idByLabel.get("b")!)).toBe(false)
  })
})

describe("display name resolution (§9.2, task 0018)", () => {
  it("tier 1: an explicit inspector name wins over component.displayName and the transform-discovered name", () => {
    const { registry } = setup()
    const def = { view: () => m("div"), displayName: "FromApp" } as Component & { displayName: string }
    registry.setDisplayName(def, "FromOverride")
    // s1's transform-discovered name is "App" (setup()); def.displayName is "FromApp".
    const App = registry.instrument(`${MODULE}:s1`, def)
    const usage = m(App)
    m.render(root, usage)
    registry.flush()

    const id = idOf(registry, usage.state as object)
    const record = registry.recordOf(id)
    expect(record?.displayName).toBe("FromOverride")
    expect(record?.displayNameInferred).toBe(false)
  })

  it('tier 2: component.displayName ("UserCard.displayName = ...") wins over the transform-discovered name', () => {
    const { registry } = setup()
    const def = { view: () => m("div"), displayName: "UserCard" } as Component & { displayName: string }
    // s1's transform-discovered name is "App" (setup()) — displayName must win.
    const App = registry.instrument(`${MODULE}:s1`, def)
    const usage = m(App)
    m.render(root, usage)
    registry.flush()

    const id = idOf(registry, usage.state as object)
    const record = registry.recordOf(id)
    expect(record?.displayName).toBe("UserCard")
    expect(record?.displayNameInferred).toBe(false)
  })

  it("tier 3: the transform-discovered variable/export name wins over the definition's own function name", () => {
    const { registry } = setup()
    function Something(): { view: () => unknown } {
      return { view: () => m("div") }
    }
    // s1's transform-discovered name is "App" (setup()), distinct from "Something".
    const Wrapped = registry.instrument(`${MODULE}:s1`, Something)
    const usage = m(Wrapped as unknown as Component)
    m.render(root, usage)
    registry.flush()

    const id = idOf(registry, usage.state as object)
    const record = registry.recordOf(id)
    expect(record?.displayName).toBe("App")
    expect(record?.displayNameInferred).toBe(false)
  })

  it("tier 4: the class name wins over both a resolvable filename and Anonymous", () => {
    const { sources, registry } = setup({ mode: "components" })
    const OTHER_MODULE: ModuleId = "m:src/container.ts"
    sources.registerModule(OTHER_MODULE, {
      file: "/project/src/container.ts",
      relativeFile: "src/container.ts",
      sources: { s1: { line: 1, column: 1, kind: "component-declaration" } }, // no displayName
    })
    class Widget implements Component {
      view() {
        return m("div.widget")
      }
    }
    registry.instrument(`${OTHER_MODULE}:s1`, Widget)
    const usage = m(Widget)
    m.render(root, usage)
    registry.flush()

    const id = idOf(registry, usage.state as object)
    const record = registry.recordOf(id)
    expect(record?.displayName).toBe("Widget") // not "container" (filename)
    expect(record?.displayNameInferred).toBe(false)
    expect(record?.kind).toBe("class")
  })

  it("tier 5: the function name wins over both a resolvable filename and Anonymous", () => {
    const { sources, registry } = setup()
    const FACTORY_MODULE: ModuleId = "m:src/factory.ts"
    sources.registerModule(FACTORY_MODULE, {
      file: "/project/src/factory.ts",
      relativeFile: "src/factory.ts",
      sources: { s1: { line: 1, column: 1, kind: "component-declaration" } }, // no displayName
    })
    function Counter() {
      let count = 0
      return { view: () => m("div", count) }
    }
    const Wrapped = registry.instrument(`${FACTORY_MODULE}:s1`, Counter)
    const usage = m(Wrapped as unknown as Component)
    m.render(root, usage)
    registry.flush()

    const id = idOf(registry, usage.state as object)
    const record = registry.recordOf(id)
    expect(record?.displayName).toBe("Counter") // not "factory" (filename)
    expect(record?.displayNameInferred).toBe(false)
  })

  it("tier 6: falls back to a filename-derived name for an anonymous component backed by a real source location", () => {
    const { sources, registry } = setup()
    const PAGE_MODULE: ModuleId = "m:src/Page.tsx"
    sources.registerModule(PAGE_MODULE, {
      file: "/project/src/Page.tsx",
      relativeFile: "src/Page.tsx",
      // Mirrors an anonymous default-export component (§6.5): the transform
      // still registers a real declaration source, just with no displayName.
      sources: { s1: { line: 1, column: 1, kind: "component-declaration" } },
    })
    const Anon = registry.instrument(`${PAGE_MODULE}:s1`, { view: () => m("div") } as Component)
    const usage = m(Anon)
    m.render(root, usage)
    registry.flush()

    const id = idOf(registry, usage.state as object)
    const record = registry.recordOf(id)
    expect(record?.displayName).toBe("Page")
    expect(record?.displayNameInferred).toBe(true)
    // A filename-derived name is not "unresolvable" (§2.4), so this no longer
    // downgrades to kind: anonymous the way a truly nameless component does.
    expect(record?.kind).toBe("object")
  })

  // Tier 7 (Anonymous, when nothing else resolves) is covered above by
  // "reports kind: anonymous for an inline object component with no
  // resolvable name (§2.4)".

  it("survives HMR module replacement: a re-registered source table's renamed declaration takes effect live", () => {
    const { sources, registry } = setup()
    const App = registry.instrument(`${MODULE}:s1`, { view: () => m("div") } as Component)
    const usage = m(App)
    m.render(root, usage)
    registry.flush()

    const id = idOf(registry, usage.state as object)
    expect(registry.displayNameOf(id)).toBe("App")

    // Simulate HMR: the module re-executes and re-registers its source table
    // wholesale under the same stable module id (ADR-106), with a renamed
    // declaration — the already-mounted instance never re-runs `instrument()`.
    sources.registerModule(MODULE, {
      file: "/project/src/App.ts",
      relativeFile: "src/App.ts",
      sources: {
        s1: { line: 3, column: 1, kind: "component-declaration", displayName: "AppRenamed" },
        s2: { line: 8, column: 1, kind: "component-declaration", displayName: "Row" },
      },
    })

    expect(registry.displayNameOf(id)).toBe("AppRenamed")
    expect(registry.recordOf(id)?.displayName).toBe("AppRenamed")
  })
})
