import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OVERLAY_PACKAGE_ID, RUNTIME_PACKAGE_ID } from "@mithril-inspector/adapter-kit"

import { mithrilInspector } from "./plugin.js"

interface FakeRule {
  enforce?: string
  test?: RegExp
  exclude?: RegExp
  use?: Array<{ loader: string; options: Record<string, unknown> }>
}

interface FakeDevServer {
  setupMiddlewares?: (middlewares: unknown[], ctx: unknown) => unknown[]
  [key: string]: unknown
}

interface FakeCompiler {
  context: string
  options: {
    mode?: string
    entry?: unknown
    module: { rules: FakeRule[] }
    resolve: { alias?: Record<string, string> }
    devServer?: FakeDevServer
  }
  webpack?: { EntryPlugin: EntryPluginSpyCtor }
  rspack?: { EntryPlugin: EntryPluginSpyCtor }
}

type EntryPluginSpyCtor = ReturnType<typeof makeEntryPluginSpy>["ctor"]

function makeEntryPluginSpy() {
  const calls: Array<{ context: string; entry: string; name: unknown }> = []
  const applyCalls: unknown[] = []
  function ctor(context: string, entry: string, name: unknown) {
    calls.push({ context, entry, name })
    return { apply: (compiler: unknown) => applyCalls.push(compiler) }
  }
  return { ctor, calls, applyCalls }
}

function makeCompiler(overrides: Partial<FakeCompiler["options"]> = {}, root = "/app"): FakeCompiler {
  return {
    context: root,
    options: {
      mode: "development",
      entry: "./src/index.ts",
      module: { rules: [] },
      resolve: {},
      ...overrides,
    },
  }
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mi-webpack-plugin-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe("mithrilInspector webpack plugin (§12.5)", () => {
  it("is inactive in production mode by default: no rule, no alias, no entry injection, no devServer wiring", () => {
    const compiler = makeCompiler({ mode: "production" }, root)
    const entrySpy = makeEntryPluginSpy()
    compiler.webpack = { EntryPlugin: entrySpy.ctor }

    mithrilInspector({ root }, { NODE_ENV: "development" }).apply(compiler as never)

    expect(compiler.options.module.rules).toEqual([])
    expect(compiler.options.resolve.alias).toBeUndefined()
    expect(entrySpy.calls).toEqual([])
    expect(compiler.options.devServer).toBeUndefined()
  })

  it("enabled:false stays inactive even with includeInProduction", () => {
    const compiler = makeCompiler({ mode: "production" }, root)
    compiler.webpack = { EntryPlugin: makeEntryPluginSpy().ctor }

    mithrilInspector({ root, enabled: false, includeInProduction: true }, { NODE_ENV: "development" }).apply(
      compiler as never,
    )

    expect(compiler.options.module.rules).toEqual([])
  })

  it("includeInProduction forces activation in production mode", () => {
    const compiler = makeCompiler({ mode: "production" }, root)
    const entrySpy = makeEntryPluginSpy()
    compiler.webpack = { EntryPlugin: entrySpy.ctor }

    mithrilInspector({ root, includeInProduction: true }, { NODE_ENV: "development" }).apply(compiler as never)

    expect(compiler.options.module.rules).toHaveLength(1)
  })

  it("unshifts an enforce:pre loader rule wired to the shared transform", () => {
    const compiler = makeCompiler({}, root)
    compiler.options.module.rules.push({ test: /\.css$/, use: [] })
    compiler.webpack = { EntryPlugin: makeEntryPluginSpy().ctor }

    mithrilInspector({ root }, { NODE_ENV: "development" }).apply(compiler as never)

    expect(compiler.options.module.rules).toHaveLength(2)
    const rule = compiler.options.module.rules[0]
    expect(rule?.enforce).toBe("pre")
    expect(rule?.test?.test("App.tsx")).toBe(true)
    expect(rule?.exclude?.test("/app/node_modules/foo/index.js")).toBe(true)
    expect(rule?.use?.[0]?.loader.endsWith("loader.cjs")).toBe(true)
    expect(rule?.use?.[0]?.options.runtimeModule).toBe("mithril-inspector/virtual-runtime")
    expect(rule?.use?.[0]?.options.root).toBe(root)
  })

  it("aliases the virtual runtime/overlay specifiers to the written bootstrap files, preserving existing aliases", () => {
    const compiler = makeCompiler({}, root)
    compiler.options.resolve.alias = { "existing-alias": "/somewhere" }
    compiler.webpack = { EntryPlugin: makeEntryPluginSpy().ctor }

    mithrilInspector({ root }, { NODE_ENV: "development" }).apply(compiler as never)

    const alias = compiler.options.resolve.alias
    expect(alias?.["existing-alias"]).toBe("/somewhere")
    expect(alias?.["mithril-inspector/virtual-runtime$"]).toBe(
      join(root, "node_modules", ".cache", "mithril-inspector", "runtime-bootstrap.js"),
    )
    expect(alias?.["mithril-inspector/virtual-overlay$"]).toBe(
      join(root, "node_modules", ".cache", "mithril-inspector", "overlay-bootstrap.js"),
    )
  })

  it("also aliases the bootstrap files' own @mithril-inspector/runtime and /overlay bare imports to their real resolved paths (regression: pnpm's isolated node_modules leaves them unresolvable from the bootstrap files' own location)", () => {
    const compiler = makeCompiler({}, root)
    compiler.webpack = { EntryPlugin: makeEntryPluginSpy().ctor }

    mithrilInspector({ root }, { NODE_ENV: "development" }).apply(compiler as never)

    const alias = compiler.options.resolve.alias
    expect(alias?.[`${RUNTIME_PACKAGE_ID}$`]).toMatch(/[/\\]runtime[/\\]dist[/\\]index\.js$/)
    expect(alias?.[`${OVERLAY_PACKAGE_ID}$`]).toMatch(/[/\\]overlay[/\\]dist[/\\]index\.js$/)
  })

  it("injects the overlay bootstrap entry into every named entry via EntryPlugin, without editing app-entry config", () => {
    const compiler = makeCompiler({ entry: { main: "./src/index.ts", admin: "./src/admin.ts" } }, root)
    const entrySpy = makeEntryPluginSpy()
    compiler.webpack = { EntryPlugin: entrySpy.ctor }

    mithrilInspector({ root }, { NODE_ENV: "development" }).apply(compiler as never)

    expect(entrySpy.calls).toHaveLength(2)
    expect(entrySpy.calls.map((c) => c.name).sort()).toEqual(["admin", "main"])
    for (const call of entrySpy.calls) {
      expect(call.context).toBe(root)
      expect(call.entry).toBe(join(root, "node_modules", ".cache", "mithril-inspector", "overlay-bootstrap.js"))
    }
    expect(entrySpy.applyCalls).toHaveLength(2)
    // entry config itself is never mutated (Rspack forbids it post-construction).
    expect(compiler.options.entry).toEqual({ main: "./src/index.ts", admin: "./src/admin.ts" })
  })

  it("falls back to compiler.rspack.EntryPlugin when compiler.webpack is absent", () => {
    const compiler = makeCompiler({}, root)
    const entrySpy = makeEntryPluginSpy()
    compiler.rspack = { EntryPlugin: entrySpy.ctor }

    mithrilInspector({ root }, { NODE_ENV: "development" }).apply(compiler as never)

    expect(entrySpy.calls).toHaveLength(1)
  })

  it("warns and skips entry injection for a dynamic (function) entry instead of throwing", () => {
    const compiler = makeCompiler({ entry: () => Promise.resolve("./src/index.ts") }, root)
    const entrySpy = makeEntryPluginSpy()
    compiler.webpack = { EntryPlugin: entrySpy.ctor }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    mithrilInspector({ root }, { NODE_ENV: "development" }).apply(compiler as never)

    expect(entrySpy.calls).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain("mithril-inspector/virtual-overlay")
  })

  it("throws a clear error when neither compiler.webpack nor compiler.rspack expose EntryPlugin", () => {
    const compiler = makeCompiler({}, root)

    expect(() => mithrilInspector({ root }, { NODE_ENV: "development" }).apply(compiler as never)).toThrow(
      /EntryPlugin/,
    )
  })

  it("wires the open-in-editor middleware into devServer.setupMiddlewares, preserving existing config", () => {
    const compiler = makeCompiler({}, root)
    compiler.options.devServer = { port: 1234 }
    compiler.webpack = { EntryPlugin: makeEntryPluginSpy().ctor }

    mithrilInspector({ root, editor: "code" }, { NODE_ENV: "development" }).apply(compiler as never)

    expect(compiler.options.devServer?.port).toBe(1234)
    expect(typeof compiler.options.devServer?.setupMiddlewares).toBe("function")
    const middlewares = compiler.options.devServer?.setupMiddlewares?.([], {}) ?? []
    expect(middlewares).toHaveLength(1)
  })
})
