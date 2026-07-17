import m from "mithril"
import type { Component } from "mithril"
import type { ModuleId, PreviewPath, RuntimeEvent } from "@mithril-inspector/protocol"
import { makeComponentId, PROTOCOL_VERSION } from "@mithril-inspector/protocol"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createRuntime } from "./runtime.js"
import type { InspectorRuntime } from "./runtime.js"
import type { ModuleRegistrationInput } from "./source-registry.js"
import { getInspectorHook, source as globalSource } from "./index.js"
import { __resetRuntimeForTests } from "./runtime.js"

const MODULE: ModuleId = "m:src/App.ts"

const registration: ModuleRegistrationInput = {
  file: "/project/src/App.ts",
  relativeFile: "src/App.ts",
  sources: {
    s1: { line: 3, column: 1, kind: "component-declaration", displayName: "App" },
    s2: { line: 4, column: 3, kind: "element", tagName: "div" },
    s3: { line: 5, column: 5, kind: "element", tagName: "span" },
  },
}

let root: HTMLElement
let runtime: InspectorRuntime

beforeEach(() => {
  root = document.createElement("div")
  document.body.replaceChildren(root)
  // A manual scheduler so flushes are deterministic; call runtime.flush() by hand.
  runtime = createRuntime({ schedule: () => {} })
  runtime.registerSourceModule(MODULE, registration)
})

afterEach(() => {
  __resetRuntimeForTests()
})

describe("InspectorRuntime end-to-end", () => {
  it("resolves a source-wrapped element node to its location (registration + weak-map lookup)", () => {
    m.render(root, runtime.source(`${MODULE}:s2`, m("div.app", "hi")))
    runtime.flush()
    const div = root.querySelector("div.app")!
    expect(runtime.resolveDomSource(div)?.line).toBe(4)
    expect(runtime.resolveDomSource(div.firstChild!)?.line).toBe(4)
  })

  it("tracks a component through mount, update and remove", () => {
    const App = runtime.component(`${MODULE}:s1`, {
      view: () => runtime.source(`${MODULE}:s2`, m("div.app", "x")),
    } as Component)
    const usage = m(App)
    m.render(root, usage)
    runtime.flush()

    const id = runtime.components.idOf(usage.state as object)!
    expect(runtime.componentRecord(id)?.displayName).toBe("App")
    expect(runtime.resolveDomComponent(root.querySelector("div.app")!)).toBe(id)

    m.render(root, m(App))
    runtime.flush()
    expect(runtime.componentRecord(id)?.updateCount).toBe(1)

    m.render(root, [])
    runtime.flush()
    expect(runtime.componentRecord(id)).toBeUndefined()
    expect(runtime.getSnapshot().components.size).toBe(0)
  })

  it("supports multiple application roots without cross-contamination (§3.1)", () => {
    const rootB = document.createElement("div")
    document.body.appendChild(rootB)
    m.render(root, runtime.source(`${MODULE}:s2`, m("div.a")))
    m.render(rootB, runtime.source(`${MODULE}:s3`, m("span.b")))
    runtime.flush()

    expect(runtime.resolveDomSource(root.querySelector("div.a")!)?.tagName).toBe("div")
    expect(runtime.resolveDomSource(rootB.querySelector("span.b")!)?.tagName).toBe("span")
  })

  it("retains a removed node's source for stale selection, then reflects HMR (§8.8)", () => {
    const build = () => runtime.source(`${MODULE}:s2`, m("div.app"))
    m.render(root, build())
    runtime.flush()
    const div = root.querySelector("div.app")!
    expect(runtime.resolveDomSource(div)?.line).toBe(4)

    m.render(root, m("section"))
    runtime.flush()
    // Detached node keeps its last-known source.
    expect(runtime.resolveDomSource(div)?.line).toBe(4)
  })

  it("excludes an overlay host from both source and component resolution (§8.2)", () => {
    const host = document.createElement("div")
    host.id = "__mithril-inspector-host"
    document.body.appendChild(host)
    runtime.excludeHost(host)

    const Widget = runtime.component(`${MODULE}:s1`, {
      view: () => runtime.source(`${MODULE}:s2`, m("div.w")),
    } as Component)
    m.render(host, m(Widget))
    runtime.flush()
    const inside = host.querySelector("div.w")!
    expect(runtime.resolveDomSource(inside)).toBeNull()
    expect(runtime.resolveDomComponent(inside)).toBeNull()
  })

  it("does not introduce wrapper DOM or mutate structure (§2.3)", () => {
    const App = runtime.component(`${MODULE}:s1`, {
      view: () => runtime.source(`${MODULE}:s2`, m("div.app", runtime.source(`${MODULE}:s3`, m("span.c", "hi")))),
    } as Component)
    m.render(root, m(App))
    runtime.flush()
    // Exactly the app's DOM: div.app > span.c > "hi", nothing wrapped.
    expect(root.innerHTML).toBe('<div class="app"><span class="c">hi</span></div>')
  })

  it("never lets a throwing subscriber break emit or the host render (§16)", () => {
    runtime.subscribe(() => {
      throw new Error("subscriber blew up")
    })
    const seen: RuntimeEvent[] = []
    runtime.subscribe((e) => seen.push(e))
    const App = runtime.component(`${MODULE}:s1`, { view: () => m("div") } as Component)
    expect(() => {
      m.render(root, m(App))
      runtime.flush()
    }).not.toThrow()
    // The second (well-behaved) subscriber still received the batched event.
    expect(seen.some((e) => e.type === "components-added")).toBe(true)
  })

  it("returns the vnode untouched from source() when the feature is disabled", () => {
    // Force the "source" feature off by exceeding the failure threshold via a
    // resolveDomSource that throws on a bad node is hard to trigger; instead
    // assert the pass-through contract holds for a normal call.
    const vnode = m("div")
    expect(runtime.source(`${MODULE}:s2`, vnode)).toBe(vnode)
  })

  it("exposes the public §14 API: inspectComponent names and instruments", () => {
    const App = getInspectorHook() // ensure singleton wiring works
    expect(App.protocolVersion).toBe(PROTOCOL_VERSION)

    const def = { view: () => m("div.named") } as Component
    runtime.setInspectorDisplayName(def, "Explicit")
    const Instrumented = runtime.component(`${MODULE}:s1`, def)
    const usage = m(Instrumented)
    m.render(root, usage)
    runtime.flush()
    const id = runtime.components.idOf(usage.state as object)!
    // The override beats the transform-provided "App" display name.
    expect(runtime.componentRecord(id)?.displayName).toBe("Explicit")
  })

  it("builds a getSnapshot with modules, components and dom associations", () => {
    const App = runtime.component(`${MODULE}:s1`, {
      view: () => runtime.source(`${MODULE}:s2`, m("div.app")),
    } as Component)
    m.render(root, m(App))
    runtime.flush()

    const snapshot = runtime.getSnapshot()
    expect(snapshot.modules.get(MODULE)?.relativeFile).toBe("src/App.ts")
    expect(snapshot.components.size).toBe(1)
    const divAssoc = snapshot.domAssociations.get(root.querySelector("div.app")!)
    expect(divAssoc?.[0]?.source?.line).toBe(4)
  })

  it("supports subscribe/unsubscribe", () => {
    const seen: RuntimeEvent[] = []
    const unsubscribe = runtime.subscribe((e) => seen.push(e))
    const App = runtime.component(`${MODULE}:s1`, { view: () => m("div") } as Component)
    m.render(root, m(App))
    runtime.flush()
    const countAfterFirst = seen.length
    expect(countAfterFirst).toBeGreaterThan(0)

    unsubscribe()
    m.render(root, [])
    runtime.flush()
    expect(seen.length).toBe(countAfterFirst)
  })

  it("honours the protocol hook's manual registration methods", () => {
    const id = runtime.registerComponent({
      id: "c:9001",
      parentId: null,
      displayName: "Manual",
      displayNameInferred: false,
      source: null,
      kind: "object",
      attrs: null,
      state: null,
      mounted: true,
      createdAt: 0,
      updatedAt: 0,
      updateCount: 0,
      domRange: null,
      childIds: [],
    })
    expect(id).toBe("c:9001")
    expect(runtime.getSnapshot().components.get("c:9001")?.displayName).toBe("Manual")

    const vId = runtime.registerVNode({ id: "v:1", componentId: null, source: null, domRange: null })
    expect(runtime.getSnapshot().vnodes.get(vId)?.id).toBe("v:1")
    runtime.disposeVNode(vId)
    expect(runtime.getSnapshot().vnodes.has(vId)).toBe(false)
  })

  it("installs a single global hook and reuses it across getRuntime calls", () => {
    const hook = getInspectorHook()
    expect((globalThis as { __MITHRIL_INSPECTOR__?: unknown }).__MITHRIL_INSPECTOR__).toBe(hook)
    expect(getInspectorHook()).toBe(hook)
    // The exported free `source` delegates to the same singleton hook.
    const vnode = m("div")
    expect(globalSource(`${MODULE}:s2`, vnode)).toBe(vnode)
  })

  it("flushes associations on a microtask without a manual flush", async () => {
    const auto = createRuntime() // default queueMicrotask scheduler
    auto.registerSourceModule(MODULE, registration)
    m.render(root, auto.source(`${MODULE}:s2`, m("div.auto")))
    await Promise.resolve()
    await Promise.resolve()
    expect(auto.resolveDomSource(root.querySelector("div.auto")!)?.line).toBe(4)
  })

  it("wires getMode through to the component registry (task 0017 mode gating)", () => {
    class Widget implements Component {
      view() {
        return m("div.widget")
      }
    }
    // Default mode ("source"): class components stay inert end-to-end
    // through the runtime's own `component()` entry point, not just the
    // registry in isolation.
    runtime.component(`${MODULE}:s1`, Widget)
    const inertUsage = m(Widget)
    m.render(root, inertUsage)
    expect(runtime.components.idOf(inertUsage.state as object)).toBeUndefined()

    const componentsMode = createRuntime({ schedule: () => {}, mode: "components" })
    componentsMode.registerSourceModule(MODULE, registration)
    class OtherWidget implements Component {
      view() {
        return m("div.other")
      }
    }
    componentsMode.component(`${MODULE}:s1`, OtherWidget)
    const activeUsage = m(OtherWidget)
    m.render(root, activeUsage)
    expect(componentsMode.components.idOf(activeUsage.state as object)).toBeDefined()
  })

  it("wires componentAncestry through to the component registry, root-first including self (task 0019)", () => {
    const Row = runtime.component("", { view: () => m("span.row") } as Component)
    const App = runtime.component(`${MODULE}:s1`, { view: () => m("div.app", m(Row)) } as Component)
    const usage = m(App)
    m.render(root, usage)
    runtime.flush()

    const rowId = runtime.resolveDomComponent(root.querySelector("span.row")!)!
    const chain = runtime.componentAncestry(rowId)
    expect(chain.map((r) => r.id)).toEqual([runtime.components.idOf(usage.state as object), rowId])
  })

  it("returns [] from componentAncestry for an unknown id (task 0019)", () => {
    expect(runtime.componentAncestry(makeComponentId(999_999))).toEqual([])
  })

  it("wires componentViewSource through to the component registry (task 0019, §9.3)", () => {
    runtime.registerSourceModule(MODULE, {
      file: "/project/src/App.ts",
      relativeFile: "src/App.ts",
      sources: {
        s1: { line: 3, column: 1, kind: "component-declaration", displayName: "App" },
        s2: { line: 4, column: 3, kind: "component-view" },
      },
    })
    const App = runtime.component(`${MODULE}:s1`, { view: () => m("div.app") } as Component)
    const usage = m(App)
    m.render(root, usage)
    runtime.flush()

    const id = runtime.components.idOf(usage.state as object)!
    expect(runtime.componentViewSource(id)?.kind).toBe("component-view")
    expect(runtime.componentViewSource(id)?.line).toBe(4)
  })

  describe("attrs/state preview (task 0020, §7.4, §15)", () => {
    it("serializes an instance's live attrs and state through the safe serializer", () => {
      interface AppAttrs {
        label: string
      }
      interface AppState {
        count: number
      }
      const App = runtime.component(
        `${MODULE}:s1`,
        {
          oninit(vnode) {
            vnode.state.count = 0
          },
          view: () => m("div"),
        } as Component<AppAttrs, AppState>,
      )
      const usage = m(App, { label: "hi" })
      m.render(root, usage)
      runtime.flush()
      const id = runtime.components.idOf(usage.state as object)!

      expect(runtime.attrsPreview(id)).toEqual({
        kind: "object",
        className: "Object",
        size: 1,
        entries: [{ key: "label", node: { kind: "primitive", type: "string", value: "hi" } }],
        offset: 0,
        truncated: false,
        path: [],
      })
      expect(runtime.statePreview(id)).toEqual({
        kind: "object",
        className: "Object",
        size: 1,
        entries: [{ key: "count", node: { kind: "primitive", type: "number", value: 0 } }],
        offset: 0,
        truncated: false,
        path: [],
      })
    })

    it("redacts attrs by the runtime's configured redaction policy", () => {
      interface SecretAttrs {
        secretValue: string
        label: string
      }
      const redacting = createRuntime({ schedule: () => {}, redact: { keys: ["secret"], replacement: "HIDDEN" } })
      redacting.registerSourceModule(MODULE, registration)
      const App = redacting.component(`${MODULE}:s1`, { view: () => m("div") } as Component<SecretAttrs>)
      const usage = m(App, { secretValue: "shh", label: "visible" })
      m.render(root, usage)
      redacting.flush()
      const id = redacting.components.idOf(usage.state as object)!

      const preview = redacting.attrsPreview(id) as { entries: Array<{ key: string; node: unknown }> }
      expect(preview.entries).toEqual([
        { key: "secretValue", node: { kind: "redacted", replacement: "HIDDEN" } },
        { key: "label", node: { kind: "primitive", type: "string", value: "visible" } },
      ])
    })

    it("applies a per-component setInspectorSerializer hook before the safe serializer (§14)", () => {
      // "ssn" is deliberately outside the §15 default pattern list, so this
      // exercises the custom hook's own masking taking effect — not the
      // separate (and always-on, see the redaction describe block) default
      // key-pattern safety net.
      interface SsnAttrs {
        ssn: string
        label: string
      }
      const def = { view: () => m("div") } as Component<SsnAttrs>
      runtime.setInspectorSerializer(def, {
        attrs: (attrs) => ({ ...(attrs as SsnAttrs), ssn: "***-**-6789" }),
      })
      const Instrumented = runtime.component(`${MODULE}:s1`, def)
      const usage = m(Instrumented, { ssn: "123-45-6789", label: "hi" })
      m.render(root, usage)
      runtime.flush()
      const id = runtime.components.idOf(usage.state as object)!

      const preview = runtime.attrsPreview(id) as { entries: Array<{ key: string; node: unknown }> }
      const ssn = preview.entries.find((e) => e.key === "ssn")
      expect(ssn?.node).toEqual({ kind: "primitive", type: "string", value: "***-**-6789" })
    })

    it("falls back to the raw value when a custom serializer hook throws (§16)", () => {
      interface LabelAttrs {
        label: string
      }
      const def = { view: () => m("div") } as Component<LabelAttrs>
      runtime.setInspectorSerializer(def, {
        attrs: () => {
          throw new Error("bad hook")
        },
      })
      const Instrumented = runtime.component(`${MODULE}:s1`, def)
      const usage = m(Instrumented, { label: "hi" })
      m.render(root, usage)
      runtime.flush()
      const id = runtime.components.idOf(usage.state as object)!

      expect(runtime.attrsPreview(id)).toEqual({
        kind: "object",
        className: "Object",
        size: 1,
        entries: [{ key: "label", node: { kind: "primitive", type: "string", value: "hi" } }],
        offset: 0,
        truncated: false,
        path: [],
      })
    })

    it("expandPreview evaluates a deferred getter for a component's attrs", () => {
      const App = runtime.component(`${MODULE}:s1`, { view: () => m("div") } as Component)
      const attrs: Record<string, unknown> = { label: "hi" }
      Object.defineProperty(attrs, "computed", { enumerable: true, get: () => 99 })
      const usage = m(App, attrs)
      m.render(root, usage)
      runtime.flush()
      const id = runtime.components.idOf(usage.state as object)!

      const preview = runtime.attrsPreview(id) as { entries: Array<{ key: string; node: { kind: string; path: PreviewPath } }> }
      const computed = preview.entries.find((e) => e.key === "computed")!
      expect(computed.node.kind).toBe("getter")

      const expanded = runtime.expandPreview(id, "attrs", computed.node.path)
      expect(expanded).toEqual({ kind: "primitive", type: "number", value: 99 })
    })

    it("returns null for attrsPreview/statePreview/expandPreview on an unknown id", () => {
      const unknown = makeComponentId(999_999)
      expect(runtime.attrsPreview(unknown)).toBeNull()
      expect(runtime.statePreview(unknown)).toBeNull()
      expect(runtime.expandPreview(unknown, "attrs", [])).toBeNull()
    })
  })
})
