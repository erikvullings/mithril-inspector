import { describe, expect, it, vi } from "vitest"
import type { ConfigEnv, HmrContext, Plugin, ResolvedConfig, ViteDevServer } from "vite"

import { HMR_INVALIDATE_EVENT } from "./hmr.js"
import { OVERLAY_MODULE_ID, RESOLVED_OVERLAY_ID, RESOLVED_RUNTIME_ID, RUNTIME_MODULE_ID } from "./ids.js"
import { DIAGNOSTICS_PATH } from "./diagnostics.js"
import { mithrilInspector } from "./plugin.js"
import type { MithrilInspectorOptions } from "./options.js"

// --- Hook-calling helpers (a plugin hook may be a fn or an { handler } object) --
type AnyFn = (...args: never[]) => unknown
function hookFn(hook: unknown): (...args: never[]) => unknown {
  if (typeof hook === "function") return hook as AnyFn
  if (hook !== null && typeof hook === "object" && "handler" in hook) {
    return (hook as { handler: AnyFn }).handler
  }
  throw new Error("hook is not present")
}

const DEV_ENV = { NODE_ENV: "development" } as const

function plugins(options: MithrilInspectorOptions = {}): Plugin[] {
  return mithrilInspector(options, DEV_ENV)
}
const pre = (options: MithrilInspectorOptions = {}): Plugin =>
  plugins(options).find((p) => p.name === "mithril-inspector:pre")!
const serve = (options: MithrilInspectorOptions = {}): Plugin =>
  plugins(options).find((p) => p.name === "mithril-inspector:serve")!

function configResolve(plugin: Plugin, root = "/repo"): void {
  hookFn(plugin.configResolved)({ root } as ResolvedConfig as never)
}

const buildEnv = { command: "build", mode: "production" } as ConfigEnv
const serveEnv = { command: "serve", mode: "development" } as ConfigEnv
function applies(plugin: Plugin, env: ConfigEnv): boolean {
  const apply = plugin.apply
  return typeof apply === "function" ? apply({} as never, env) : true
}

describe("mithrilInspector plugin assembly (§11.1)", () => {
  it("returns a pre and a serve plugin", () => {
    const names = plugins().map((p) => p.name)
    expect(names).toContain("mithril-inspector:pre")
    expect(names).toContain("mithril-inspector:serve")
  })

  it("marks the pre plugin enforce:pre so it sees original TS/JSX (§11.3)", () => {
    expect(pre().enforce).toBe("pre")
  })
})

describe("build-mode exclusion (§2.1, §20.1.12)", () => {
  it("is inactive during build by default and active during serve", () => {
    for (const p of plugins()) {
      expect(applies(p, serveEnv)).toBe(true)
      expect(applies(p, buildEnv)).toBe(false)
    }
  })

  it("stays active during build when includeInProduction is set", () => {
    for (const p of plugins({ includeInProduction: true })) {
      expect(applies(p, buildEnv)).toBe(true)
    }
  })

  it("is fully inactive when disabled", () => {
    for (const p of mithrilInspector({ enabled: false }, DEV_ENV)) {
      expect(applies(p, serveEnv)).toBe(false)
      expect(applies(p, buildEnv)).toBe(false)
    }
  })
})

describe("virtual module serving (§11.2)", () => {
  it("resolves the runtime and overlay ids to NUL-prefixed resolved ids", () => {
    const p = pre()
    expect(hookFn(p.resolveId)(RUNTIME_MODULE_ID as never)).toBe(RESOLVED_RUNTIME_ID)
    expect(hookFn(p.resolveId)(OVERLAY_MODULE_ID as never)).toBe(RESOLVED_OVERLAY_ID)
    expect(hookFn(p.resolveId)("mithril" as never)).toBeNull()
  })

  it("loads the runtime and overlay bootstraps", () => {
    const p = pre({ mode: "full", source: { exposeDomAttributes: true } })
    const runtime = hookFn(p.load)(RESOLVED_RUNTIME_ID as never) as string
    expect(runtime).toContain("createRuntime")
    expect(runtime).toContain('"mode":"full"')
    expect(runtime).toContain('"exposeDomAttributes":true')
    const overlay = hookFn(p.load)(RESOLVED_OVERLAY_ID as never) as string
    expect(overlay).toContain("mountInspectorOverlay")
    expect(hookFn(p.load)("/app/src/App.ts" as never)).toBeNull()
  })
})

describe("transform (§11.2)", () => {
  const source = `import m from "mithril"\nexport const A = { view: () => m("div.a", "hi") }\n`

  it("instruments a Mithril module, preserving a source map and targeting the virtual runtime", () => {
    const p = pre()
    configResolve(p)
    const result = hookFn(p.transform)(source as never, "/repo/src/App.ts" as never) as {
      code: string
      map?: unknown
    } | null
    expect(result).not.toBeNull()
    expect(result!.code).toContain("virtual:mithril-inspector/runtime")
    expect(result!.code).toContain("__miRegisterModule")
    expect(result!.map).toBeTruthy()
  })

  it("returns null for a module without Mithril", () => {
    const p = pre()
    configResolve(p)
    expect(hookFn(p.transform)("export const x = 1\n" as never, "/repo/src/plain.ts" as never)).toBeNull()
  })

  it("skips node_modules and the inspector's own packages", () => {
    const p = pre()
    configResolve(p)
    expect(hookFn(p.transform)(source as never, "/repo/node_modules/mithril/x.js" as never)).toBeNull()
    expect(
      hookFn(p.transform)(source as never, "/repo/node_modules/@mithril-inspector/overlay/dist/x.js" as never),
    ).toBeNull()
  })
})

describe("transformIndexHtml (§11.2)", () => {
  it("injects a served /@id/ overlay script in dev", () => {
    const p = serve()
    configResolve(p)
    const result = hookFn(p.transformIndexHtml)("<html></html>" as never, { server: {} } as never) as Array<{
      attrs?: Record<string, unknown>
    }>
    expect(result).toHaveLength(1)
    expect(String(result[0]?.attrs?.src)).toContain(OVERLAY_MODULE_ID)
  })

  it("injects an inline import in a forced production build", () => {
    const p = serve()
    configResolve(p)
    const result = hookFn(p.transformIndexHtml)("<html></html>" as never, {} as never) as Array<{
      children?: string
    }>
    expect(result[0]?.children).toContain(OVERLAY_MODULE_ID)
  })
})

describe("configureServer (§10, §11.2)", () => {
  function fakeServer(): { server: ViteDevServer; use: ReturnType<typeof vi.fn> } {
    const use = vi.fn()
    const server = { middlewares: { use } } as unknown as ViteDevServer
    return { server, use }
  }

  it("registers the open-in-editor middleware", () => {
    const p = serve()
    configResolve(p)
    const { server, use } = fakeServer()
    hookFn(p.configureServer)(server as never)
    expect(use).toHaveBeenCalledTimes(1)
  })

  it("also registers the diagnostics endpoint in debug mode", () => {
    const p = serve({ debug: true })
    configResolve(p)
    const { server, use } = fakeServer()
    hookFn(p.configureServer)(server as never)
    expect(use).toHaveBeenCalledTimes(2)
    expect(DIAGNOSTICS_PATH).toBe("/__mithril-inspector/diagnostics")
  })
})

describe("handleHotUpdate (§11.2, ADR-106)", () => {
  const source = `import m from "mithril"\nexport const A = { view: () => m("div.a", "hi") }\n`

  function hmrServer(): { server: ViteDevServer; send: ReturnType<typeof vi.fn> } {
    const send = vi.fn()
    const server = { ws: { send } } as unknown as ViteDevServer
    return { server, send }
  }

  it("pushes an invalidation for a changed instrumented module", () => {
    const p = pre()
    configResolve(p)
    // Transform first so the plugin knows this file's module id.
    hookFn(p.transform)(source as never, "/repo/src/App.ts" as never)

    const { server, send } = hmrServer()
    hookFn(p.handleHotUpdate)({ file: "/repo/src/App.ts", server, modules: [] } as unknown as HmrContext as never)

    expect(send).toHaveBeenCalledTimes(1)
    const message = send.mock.calls[0]![0] as { type: string; event: string; data: { moduleIds: string[] } }
    expect(message.type).toBe("custom")
    expect(message.event).toBe(HMR_INVALIDATE_EVENT)
    expect(message.data.moduleIds).toHaveLength(1)
    expect(message.data.moduleIds[0]).toMatch(/^m:/)
  })

  it("does nothing for a file it never instrumented", () => {
    const p = pre()
    configResolve(p)
    const { server, send } = hmrServer()
    hookFn(p.handleHotUpdate)({ file: "/repo/src/never.ts", server, modules: [] } as unknown as HmrContext as never)
    expect(send).not.toHaveBeenCalled()
  })
})
