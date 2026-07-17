import m from "mithril"
import type { Component } from "mithril"
import type { ModuleId } from "@mithril-inspector/protocol"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  defineInspectorName,
  inspectComponent,
  inspectSource,
  markInspectorHidden,
  setInspectorDisplayName,
  setInspectorSerializer,
} from "./api.js"
import { getInspectorHook } from "./index.js"
import { __resetRuntimeForTests } from "./runtime.js"

const MODULE: ModuleId = "m:src/Api.ts"

let root: HTMLElement

beforeEach(() => {
  root = document.createElement("div")
  document.body.replaceChildren(root)
  getInspectorHook().registerSourceModule(MODULE, {
    file: "/project/src/Api.ts",
    relativeFile: "src/Api.ts",
    sources: { s1: { line: 1, column: 1, kind: "component-declaration" } },
  })
})

afterEach(() => {
  __resetRuntimeForTests()
})

describe("public runtime API (§14)", () => {
  it("inspectComponent instruments a definition and applies an explicit name", () => {
    const Widget = inspectComponent({ view: () => m("div.widget") } as Component, { name: "Widget" })
    const usage = m(Widget)
    m.render(root, usage)
    getInspectorHook().flush()

    const id = getInspectorHook().components.idOf(usage.state as object)!
    expect(getInspectorHook().componentRecord(id)?.displayName).toBe("Widget")
    expect(root.querySelector("div.widget")).not.toBeNull()
  })

  it("setInspectorDisplayName overrides a component's resolved name", () => {
    const def = { view: () => m("div") } as Component
    setInspectorDisplayName(def, "Renamed")
    const Instrumented = getInspectorHook().component(`${MODULE}:s1`, def)
    const usage = m(Instrumented)
    m.render(root, usage)
    const id = getInspectorHook().components.idOf(usage.state as object)!
    expect(getInspectorHook().componentRecord(id)?.displayName).toBe("Renamed")
  })

  it("defineInspectorName is an alias of setInspectorDisplayName (§9.2 spelling)", () => {
    expect(defineInspectorName).toBe(setInspectorDisplayName)

    const def = { view: () => m("div") } as Component
    defineInspectorName(def, "UserCard")
    const Instrumented = getInspectorHook().component(`${MODULE}:s1`, def)
    const usage = m(Instrumented)
    m.render(root, usage)
    const id = getInspectorHook().components.idOf(usage.state as object)!
    expect(getInspectorHook().componentRecord(id)?.displayName).toBe("UserCard")
    expect(getInspectorHook().componentRecord(id)?.displayNameInferred).toBe(false)
  })

  it("markInspectorHidden flags a definition", () => {
    const def = { view: () => m("div") } as Component
    markInspectorHidden(def)
    expect(getInspectorHook().components.isHidden(def)).toBe(true)
  })

  it("setInspectorSerializer stores a serializer for a definition", () => {
    const def = { view: () => m("div") } as Component
    const serializer = { attrs: (a: unknown) => a }
    setInspectorSerializer(def, serializer)
    expect(getInspectorHook().components.serializerOf(def)).toBe(serializer)
  })

  it("inspectSource returns the vnode unchanged (Phase 1 stub)", () => {
    const vnode = m("div")
    expect(inspectSource(vnode)).toBe(vnode)
  })
})
