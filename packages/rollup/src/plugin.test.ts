import { describe, expect, it } from "vitest"
import type { Plugin, PluginContext } from "rollup"

import {
  OVERLAY_MODULE_ID,
  RESOLVED_OVERLAY_ID,
  RESOLVED_RUNTIME_ID,
  RUNTIME_MODULE_ID,
} from "@mithril-inspector/adapter-kit"

import { mithrilInspector } from "./plugin.js"
import type { MithrilInspectorOptions } from "./plugin.js"

const DEV_ENV = { NODE_ENV: "development" } as const

function fakeContext(watchMode: boolean): PluginContext {
  return { meta: { watchMode, rollupVersion: "4.0.0" } } as unknown as PluginContext
}

// A Rollup hook may be a plain function or an `{ handler, order }` object hook.
function hookFn<T extends (...args: never[]) => unknown>(hook: unknown): T {
  if (typeof hook === "function") return hook as T
  if (hook !== null && typeof hook === "object" && "handler" in hook) {
    return (hook as { handler: T }).handler
  }
  throw new Error("hook is not present")
}

function call<R>(plugin: Plugin, hookName: keyof Plugin, watchMode: boolean, ...args: never[]): R {
  const fn = hookFn<(...a: never[]) => R>(plugin[hookName])
  return fn.apply(fakeContext(watchMode), args)
}

function makePlugin(options: MithrilInspectorOptions = {}): Plugin {
  return mithrilInspector(options, DEV_ENV)
}

describe("mithrilInspector plugin assembly (§12.3)", () => {
  it("returns a single named Rollup plugin", () => {
    const plugin = makePlugin()
    expect(plugin.name).toBe("mithril-inspector")
  })

  it("marks the transform hook order:pre so it sees original TS/JSX (§11.3 analog)", () => {
    const plugin = makePlugin()
    expect(plugin.transform).not.toBeNull()
    expect(typeof plugin.transform).toBe("object")
    expect((plugin.transform as { order?: string }).order).toBe("pre")
  })
})

describe("dev-only gate (§2.1 analog via this.meta.watchMode)", () => {
  const source = `import m from "mithril"\nexport const A = { view: () => m("div.a", "hi") }\n`

  it("is inactive outside watch mode by default", () => {
    const plugin = makePlugin()
    expect(call<unknown>(plugin, "resolveId", false, RUNTIME_MODULE_ID as never)).toBeNull()
    expect(call<unknown>(plugin, "load", false, RESOLVED_RUNTIME_ID as never)).toBeNull()
    expect(call<unknown>(plugin, "transform", false, source as never, "/repo/src/App.ts" as never)).toBeNull()
  })

  it("is active in watch mode by default", () => {
    const plugin = makePlugin()
    expect(call<unknown>(plugin, "resolveId", true, RUNTIME_MODULE_ID as never)).toBe(RESOLVED_RUNTIME_ID)
    const result = call<{ code: string } | null>(
      plugin,
      "transform",
      true,
      source as never,
      "/repo/src/App.ts" as never,
    )
    expect(result).not.toBeNull()
  })

  it("stays active outside watch mode when includeInProduction is set", () => {
    const plugin = makePlugin({ includeInProduction: true })
    expect(call<unknown>(plugin, "resolveId", false, RUNTIME_MODULE_ID as never)).toBe(RESOLVED_RUNTIME_ID)
    const result = call<{ code: string } | null>(
      plugin,
      "transform",
      false,
      source as never,
      "/repo/src/App.ts" as never,
    )
    expect(result).not.toBeNull()
  })

  it("is fully inactive when disabled, even in watch mode", () => {
    const plugin = mithrilInspector({ enabled: false }, DEV_ENV)
    expect(call<unknown>(plugin, "resolveId", true, RUNTIME_MODULE_ID as never)).toBeNull()
    expect(call<unknown>(plugin, "transform", true, source as never, "/repo/src/App.ts" as never)).toBeNull()
  })
})

describe("virtual module resolution (§12.3 runtime import resolution)", () => {
  it("resolves the runtime and overlay ids to NUL-prefixed resolved ids", () => {
    const plugin = makePlugin()
    expect(call<unknown>(plugin, "resolveId", true, RUNTIME_MODULE_ID as never)).toBe(RESOLVED_RUNTIME_ID)
    expect(call<unknown>(plugin, "resolveId", true, OVERLAY_MODULE_ID as never)).toBe(RESOLVED_OVERLAY_ID)
    expect(call<unknown>(plugin, "resolveId", true, "mithril" as never)).toBeNull()
  })

  it("loads the runtime and overlay bootstrap modules", () => {
    const plugin = makePlugin({ mode: "full", source: { exposeDomAttributes: true } })
    const runtime = call<string>(plugin, "load", true, RESOLVED_RUNTIME_ID as never)
    expect(runtime).toContain("createRuntime")
    expect(runtime).toContain('"mode":"full"')
    expect(runtime).toContain('"exposeDomAttributes":true')

    const overlay = call<string>(plugin, "load", true, RESOLVED_OVERLAY_ID as never)
    expect(overlay).toContain("mountInspectorOverlay")

    expect(call<unknown>(plugin, "load", true, "/app/src/App.ts" as never)).toBeNull()
  })
})

describe("transform wiring and source-map pass-through (§12.3)", () => {
  const source = `import m from "mithril"\nexport const A = { view: () => m("div.a", "hi") }\n`

  it("instruments a Mithril module, targeting the virtual runtime, with a map", () => {
    const plugin = makePlugin()
    const result = call<{ code: string; map?: unknown } | null>(
      plugin,
      "transform",
      true,
      source as never,
      "/repo/src/App.ts" as never,
    )
    expect(result).not.toBeNull()
    expect(result!.code).toContain("virtual:mithril-inspector/runtime")
    expect(result!.code).toContain("__miRegisterModule")
    expect(result!.map).toBeTruthy()
  })

  it("returns null for a module without Mithril", () => {
    const plugin = makePlugin()
    const result = call<unknown>(plugin, "transform", true, "export const x = 1\n" as never, "/repo/src/plain.ts" as never)
    expect(result).toBeNull()
  })

  it("skips node_modules and the inspector's own packages", () => {
    const plugin = makePlugin()
    expect(
      call<unknown>(plugin, "transform", true, source as never, "/repo/node_modules/mithril/x.js" as never),
    ).toBeNull()
    expect(
      call<unknown>(
        plugin,
        "transform",
        true,
        source as never,
        "/repo/node_modules/@mithril-inspector/overlay/dist/x.js" as never,
      ),
    ).toBeNull()
  })
})
