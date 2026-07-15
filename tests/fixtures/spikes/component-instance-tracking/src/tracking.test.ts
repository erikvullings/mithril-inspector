import m from "mithril"
import type { Children, ClosureComponent, Component, Vnode } from "mithril"
import { beforeEach, describe, expect, it } from "vitest"

import { createInstanceRegistry } from "./tracking.js"
import type { ComponentId } from "./tracking.js"

let root: HTMLElement

beforeEach(() => {
  root = document.createElement("div")
  document.body.replaceChildren(root)
})

const mustGet = <K, V>(map: Map<K, V>, key: K): V => {
  const value = map.get(key)
  if (value === undefined) throw new Error(`missing map entry: ${String(key)}`)
  return value
}

describe("component instance tracking", () => {
  it("keeps a stable id across redraws for an object component, carried by the state object rather than the vnode", () => {
    const registry = createInstanceRegistry()
    const Counter: Component = {
      view: registry.instrumentView("decl:counter", () => m("output", "tick")),
    }

    const first = m(Counter)
    m.render(root, first)
    const state = first.state as object
    const id = registry.idOf(state)
    expect(id).toBeDefined()
    expect(registry.recordOf(id as ComponentId)?.declarationId).toBe("decl:counter")

    const second = m(Counter)
    m.render(root, second)
    const third = m(Counter)
    m.render(root, third)

    // Mithril creates a fresh component vnode on every redraw…
    expect(second).not.toBe(first)
    expect(third).not.toBe(second)
    // …but carries the state object over (`vnode.state = old.state`), so the
    // state object is the stable WeakMap carrier and the id never changes.
    expect(second.state as object).toBe(state)
    expect(third.state as object).toBe(state)
    expect(registry.idOf(third.state as object)).toBe(id)
  })

  it("keeps a stable id for a closure component whose returned state object stays untouched", () => {
    const registry = createInstanceRegistry()
    const returnedStates: Component[] = []
    const Stepper: ClosureComponent = () => {
      let steps = 0
      const state: Component = {
        oninit: () => {
          steps += 1
        },
        view: registry.instrumentView("decl:stepper", () => m("p", `steps:${steps}`)),
      }
      returnedStates.push(state)
      return state
    }

    const first = m(Stepper)
    m.render(root, first)
    const idAfterFirst = registry.idOf(first.state as object)
    const second = m(Stepper)
    m.render(root, second)

    // The factory ran exactly once and vnode.state is, by identity, the very
    // object it returned — the tracker never replaced or copied it…
    expect(returnedStates).toHaveLength(1)
    const state = returnedStates[0] as Component
    expect(first.state).toBe(state)
    expect(second.state).toBe(state)
    // …and never added or removed own properties on it.
    expect(Object.keys(state)).toEqual(["oninit", "view"])

    expect(idAfterFirst).toBeDefined()
    expect(registry.idOf(second.state as object)).toBe(idAfterFirst)
    expect(root.textContent).toBe("steps:1")
  })

  it("keeps a stable id for a class component with the instance and prototype chain intact", () => {
    const registry = createInstanceRegistry()
    class Clock {
      ticks = 0
      view(vnode: Vnode<Record<string, never>, Clock>): Children {
        this.ticks += 1
        return m("time", `ticks:${this.ticks}:${vnode.state === this ? "self" : "other"}`)
      }
    }
    // Simulates the transform rewriting the method definition at build time.
    Clock.prototype.view = registry.instrumentView("decl:clock", Clock.prototype.view)

    const first = m(Clock)
    m.render(root, first)
    const id = registry.idOf(first.state as object)
    expect(id).toBeDefined()
    const second = m(Clock)
    m.render(root, second)

    const state: unknown = second.state
    expect(state).toBeInstanceOf(Clock)
    expect(Object.getPrototypeOf(state)).toBe(Clock.prototype)
    // `this` inside the wrapped view is the real instance and fields persist.
    expect((state as Clock).ticks).toBe(2)
    expect(root.textContent).toBe("ticks:2:self")
    expect(registry.idOf(state as object)).toBe(id)
  })

  it("recovers parent-child relationships for a nested tree mixing all three component forms", () => {
    const registry = createInstanceRegistry()
    const states = new Map<string, object>()

    class Nav {
      view(_vnode: Vnode<Record<string, never>, Nav>): Children {
        return m("nav", "nav")
      }
      oninit(vnode: Vnode<Record<string, never>, Nav>): void {
        states.set("nav", vnode.state)
      }
    }
    Nav.prototype.view = registry.instrumentView("decl:nav", Nav.prototype.view)

    interface BadgeAttrs {
      label: string
    }
    const Badge: Component<BadgeAttrs> = {
      oninit(vnode) {
        states.set(`badge:${vnode.attrs.label}`, this)
      },
      view: registry.instrumentView("decl:badge", (vnode: Vnode<BadgeAttrs>) =>
        m("span", vnode.attrs.label),
      ),
    }

    const Page: ClosureComponent = () => ({
      oninit(vnode) {
        states.set("page", vnode.state as object)
      },
      view: registry.instrumentView("decl:page", () =>
        m("section", m(Badge, { label: "a" }), m(Badge, { label: "b" })),
      ),
    })

    const App: Component = {
      oninit(vnode) {
        states.set("app", vnode.state as object)
      },
      view: registry.instrumentView("decl:app", () => m("main", m(Nav), m(Page))),
    }

    m.render(root, m(App))

    const idOf = (name: string): ComponentId => {
      const id = registry.idOf(mustGet(states, name))
      if (id === undefined) throw new Error(`no instance id for ${name}`)
      return id
    }
    const appId = idOf("app")
    const navId = idOf("nav")
    const pageId = idOf("page")
    const badgeAId = idOf("badge:a")
    const badgeBId = idOf("badge:b")

    expect(badgeAId).not.toBe(badgeBId)
    expect(registry.recordOf(appId)?.parentId).toBeNull()
    expect(registry.recordOf(navId)?.parentId).toBe(appId)
    expect(registry.recordOf(pageId)?.parentId).toBe(appId)
    expect(registry.recordOf(badgeAId)?.parentId).toBe(pageId)
    expect(registry.recordOf(badgeBId)?.parentId).toBe(pageId)
    expect(registry.recordOf(appId)?.childIds).toEqual([navId, pageId])
    expect(registry.recordOf(pageId)?.childIds).toEqual([badgeAId, badgeBId])
    expect(registry.recordOf(badgeBId)?.declarationId).toBe("decl:badge")

    // A redraw must neither reassign ids nor duplicate child registrations.
    m.render(root, m(App))
    expect(idOf("app")).toBe(appId)
    expect(idOf("badge:b")).toBe(badgeBId)
    expect(registry.recordOf(appId)?.childIds).toEqual([navId, pageId])
    expect(registry.recordOf(pageId)?.childIds).toEqual([badgeAId, badgeBId])
  })

  it("leaves application attrs unmodified", () => {
    const registry = createInstanceRegistry()
    interface CardAttrs {
      label: string
    }
    const Card: Component<CardAttrs> = {
      view: registry.instrumentView("decl:card", (vnode: Vnode<CardAttrs>) =>
        m("b", vnode.attrs.label),
      ),
    }

    const attrs: CardAttrs = { label: "Save" }
    const first = m(Card, attrs)
    m.render(root, first)
    const second = m(Card, attrs)
    m.render(root, second)

    // Mithril hands the application's attrs object through untouched, and the
    // tracker never copies it or defines properties on it.
    expect(first.attrs).toBe(attrs)
    expect(second.attrs).toBe(attrs)
    expect(Object.keys(attrs)).toEqual(["label"])
    expect(attrs.label).toBe("Save")
    expect(root.textContent).toBe("Save")
  })

  it("preserves lifecycle order, `this`, return values and async onbeforeremove exactly as uninstrumented", async () => {
    type HookView = (this: object, vnode: Vnode<Record<string, never>, object>) => Children

    const runLifecycleScenario = async (
      wrapView: (view: HookView) => HookView,
    ): Promise<string[]> => {
      const log: string[] = []
      const gate = { allowUpdate: true }
      let releaseRemoval = (): void => {}
      const removalBlocker = new Promise<void>((resolve) => {
        releaseRemoval = resolve
      })
      const host = document.createElement("div")
      document.body.appendChild(host)

      const component: Component<Record<string, never>, object> = {
        oninit(vnode) {
          log.push(`oninit:${this === vnode.state}`)
        },
        view: wrapView(function (this: object, vnode) {
          log.push(`view:${this === vnode.state}`)
          return m("p", "alive")
        }),
        oncreate(vnode) {
          log.push(`oncreate:${this === vnode.state}:${vnode.dom instanceof HTMLParagraphElement}`)
        },
        onbeforeupdate(vnode) {
          log.push(`onbeforeupdate:${this === vnode.state}`)
          return gate.allowUpdate
        },
        onupdate(vnode) {
          log.push(`onupdate:${this === vnode.state}`)
        },
        onbeforeremove(vnode) {
          log.push(`onbeforeremove:${this === vnode.state}`)
          return removalBlocker
        },
        onremove(vnode) {
          log.push(`onremove:${this === vnode.state}`)
        },
      }

      m.render(host, m(component))
      m.render(host, m(component))
      gate.allowUpdate = false
      m.render(host, m(component))
      m.render(host, [])
      log.push(`removal-deferred:${host.querySelector("p") !== null}`)
      releaseRemoval()
      await removalBlocker
      await new Promise((resolve) => setTimeout(resolve, 0))
      log.push(`removal-completed:${host.querySelector("p") === null}`)
      host.remove()
      return log
    }

    const baseline = await runLifecycleScenario((view) => view)
    const registry = createInstanceRegistry()
    const instrumented = await runLifecycleScenario((view) =>
      registry.instrumentView("decl:lifecycle", view),
    )

    // Byte-for-byte the same story as the uninstrumented component.
    expect(instrumented).toEqual(baseline)
    expect(baseline).toEqual([
      "oninit:true",
      "view:true",
      "oncreate:true:true",
      "onbeforeupdate:true",
      "view:true",
      "onupdate:true",
      "onbeforeupdate:true", // returned false → no view call, no onupdate
      "onbeforeremove:true",
      "removal-deferred:true", // async onbeforeremove keeps the DOM attached
      "onremove:true",
      "removal-completed:true",
    ])
  })

  it("keeps ids attached to the right instances across a keyed reorder with insertion and removal", () => {
    const registry = createInstanceRegistry()
    const statesByKey = new Map<string, object>()
    interface ItemAttrs {
      id: string
    }
    const Item: ClosureComponent<ItemAttrs> = () => {
      let renders = 0
      return {
        oninit(vnode) {
          statesByKey.set(vnode.attrs.id, vnode.state as object)
        },
        view: registry.instrumentView("decl:item", (vnode: Vnode<ItemAttrs>) => {
          renders += 1
          return m("li", `${vnode.attrs.id}:${renders}`)
        }),
      }
    }
    const renderList = (keys: readonly string[]): void => {
      m.render(
        root,
        m(
          "ul",
          keys.map((key) => m(Item, { key, id: key })),
        ),
      )
    }

    renderList(["a", "b", "c", "d"])
    const idsAfterFirst = new Map<string, ComponentId>()
    for (const key of ["a", "b", "c", "d"]) {
      const id = registry.idOf(mustGet(statesByKey, key))
      if (id === undefined) throw new Error(`no id for item ${key}`)
      idsAfterFirst.set(key, id)
    }

    // Move d to the front, insert e, drop b, keep a and c interleaved.
    renderList(["d", "e", "a", "c"])

    for (const key of ["a", "c", "d"]) {
      expect(registry.idOf(mustGet(statesByKey, key))).toBe(idsAfterFirst.get(key))
    }
    const idE = registry.idOf(mustGet(statesByKey, "e"))
    expect(idE).toBeDefined()
    const allIds = new Set<ComponentId | undefined>([...idsAfterFirst.values(), idE])
    expect(allIds.size).toBe(5)

    // The moved instances kept their closure state (second render each), so
    // Mithril moved real instances and the ids stayed attached to them.
    expect(Array.from(root.querySelectorAll("li"), (li) => li.textContent)).toEqual([
      "d:2",
      "e:1",
      "a:2",
      "c:2",
    ])
  })

  it("tracks instances in multiple application roots without confusing them", () => {
    const registry = createInstanceRegistry()
    const states: object[] = []
    const stateAt = (index: number): object => {
      const state = states[index]
      if (state === undefined) throw new Error(`no captured state at ${index}`)
      return state
    }

    const Leaf: Component = {
      oninit(vnode) {
        states.push(vnode.state as object)
      },
      view: registry.instrumentView("decl:leaf", () => m("em", "leaf")),
    }
    const App: Component = {
      oninit(vnode) {
        states.push(vnode.state as object)
      },
      view: registry.instrumentView("decl:app", () => m("div", m(Leaf))),
    }

    const rootA = document.createElement("div")
    const rootB = document.createElement("div")
    document.body.append(rootA, rootB)
    m.render(rootA, m(App))
    m.render(rootB, m(App))

    const appAId = registry.idOf(stateAt(0))
    const leafAId = registry.idOf(stateAt(1))
    const appBId = registry.idOf(stateAt(2))
    const leafBId = registry.idOf(stateAt(3))

    // The same component objects mounted in two roots yield four distinct instances…
    expect(new Set([appAId, leafAId, appBId, leafBId]).size).toBe(4)
    // …with per-root parent chains that never cross.
    expect(registry.recordOf(appAId as ComponentId)?.parentId).toBeNull()
    expect(registry.recordOf(appBId as ComponentId)?.parentId).toBeNull()
    expect(registry.recordOf(leafAId as ComponentId)?.parentId).toBe(appAId)
    expect(registry.recordOf(leafBId as ComponentId)?.parentId).toBe(appBId)
    expect(registry.recordOf(appAId as ComponentId)?.childIds).toEqual([leafAId])
    expect(registry.recordOf(appBId as ComponentId)?.childIds).toEqual([leafBId])

    // Redrawing one root leaves both trees' ids untouched.
    m.render(rootA, m(App))
    expect(registry.idOf(stateAt(0))).toBe(appAId)
    expect(registry.idOf(stateAt(3))).toBe(leafBId)
    expect(states).toHaveLength(4)
    rootA.remove()
    rootB.remove()
  })

  it("keeps the lexical owner for component vnodes passed through another component's children", () => {
    const registry = createInstanceRegistry()
    const states = new Map<string, object>()

    const Leaf: Component = {
      oninit(vnode) {
        states.set("leaf", vnode.state as object)
      },
      view: registry.instrumentView("decl:leaf", () => m("i", "leaf")),
    }
    const Wrapper: Component = {
      oninit(vnode) {
        states.set("wrapper", vnode.state as object)
      },
      view: registry.instrumentView("decl:wrapper", (vnode: Vnode) =>
        m("div.wrap", vnode.children),
      ),
    }
    const Owner: Component = {
      oninit(vnode) {
        states.set("owner", vnode.state as object)
      },
      view: registry.instrumentView("decl:owner", () => m(Wrapper, m(Leaf))),
    }

    m.render(root, m(Owner))

    const ownerId = registry.idOf(mustGet(states, "owner"))
    const wrapperId = registry.idOf(mustGet(states, "wrapper"))
    const leafId = registry.idOf(mustGet(states, "leaf"))

    // §7.5: the Leaf vnode was created in Owner's view, so Owner stays its
    // owner even though Wrapper re-emitted it inside its own view result.
    expect(registry.recordOf(leafId as ComponentId)?.parentId).toBe(ownerId)
    expect(registry.recordOf(ownerId as ComponentId)?.childIds).toEqual([wrapperId, leafId])
    expect(registry.recordOf(wrapperId as ComponentId)?.childIds).toEqual([])
    expect(root.querySelector("div.wrap i")?.textContent).toBe("leaf")
  })
})
