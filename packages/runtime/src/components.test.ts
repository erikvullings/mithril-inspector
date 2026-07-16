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

const setup = (events?: RuntimeEvent[]) => {
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
    ...(events ? { emit: (e: RuntimeEvent) => events.push(e) } : {}),
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

  it("emits batched components-added and components-removed events on flush", () => {
    const events: RuntimeEvent[] = []
    const { registry } = setup(events)
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
