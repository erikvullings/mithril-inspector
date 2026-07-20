import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  BuildOptions,
  BuildResult,
  OnLoadArgs,
  OnLoadOptions,
  OnLoadResult,
  OnResolveArgs,
  OnResolveOptions,
  OnResolveResult,
  PluginBuild,
} from "esbuild"

import {
  OVERLAY_MODULE_ID,
  RESOLVED_OVERLAY_ID,
  RESOLVED_RUNTIME_ID,
  RUNTIME_MODULE_ID,
} from "@mithril-inspector/adapter-kit"
import { OPEN_IN_EDITOR_PATH } from "@mithril-inspector/server"

import { mithrilInspector } from "./plugin.js"
import type { MithrilInspectorEsbuildOptions } from "./plugin.js"

const DEV_ENV = { NODE_ENV: "development" } as const

type OnLoadHandler = (
  args: OnLoadArgs,
) => OnLoadResult | null | undefined | Promise<OnLoadResult | null | undefined>
type OnResolveHandler = (
  args: OnResolveArgs,
) => OnResolveResult | null | undefined | Promise<OnResolveResult | null | undefined>
type OnEndHandler = (result: BuildResult) => unknown
type OnDisposeHandler = () => void

/** A minimal, order-preserving stand-in for esbuild's `PluginBuild` (§12.4). */
class FakeBuild {
  readonly initialOptions: BuildOptions
  readonly onResolveCalls: Array<{ options: OnResolveOptions; callback: OnResolveHandler }> = []
  readonly onLoadCalls: Array<{ options: OnLoadOptions; callback: OnLoadHandler }> = []
  readonly onEndCalls: OnEndHandler[] = []
  readonly onDisposeCalls: OnDisposeHandler[] = []

  constructor(initialOptions: BuildOptions) {
    this.initialOptions = initialOptions
  }

  onResolve(options: OnResolveOptions, callback: OnResolveHandler): void {
    this.onResolveCalls.push({ options, callback })
  }

  onLoad(options: OnLoadOptions, callback: OnLoadHandler): void {
    this.onLoadCalls.push({ options, callback })
  }

  onEnd(callback: OnEndHandler): void {
    this.onEndCalls.push(callback)
  }

  onDispose(callback: OnDisposeHandler): void {
    this.onDisposeCalls.push(callback)
  }

  onStart(): void {
    /* unused by the plugin under test */
  }

  resolve(): never {
    throw new Error("FakeBuild.resolve is not implemented")
  }
}

function setupPlugin(
  options: MithrilInspectorEsbuildOptions = {},
  initialOptions: Partial<BuildOptions> = {},
  env: Readonly<Record<string, string | undefined>> = DEV_ENV,
): FakeBuild {
  const plugin = mithrilInspector(options, env)
  const build = new FakeBuild({ absWorkingDir: "/repo", ...initialOptions } as BuildOptions)
  void plugin.setup(build as unknown as PluginBuild)
  return build
}

async function runOnResolve(
  build: FakeBuild,
  path: string,
  namespace = "",
): Promise<OnResolveResult | null | undefined> {
  for (const call of build.onResolveCalls) {
    if (!call.options.filter.test(path)) continue
    const result = await call.callback({
      path,
      importer: "",
      namespace,
      resolveDir: "/repo",
      kind: "import-statement",
      pluginData: undefined,
      with: {},
    })
    if (result !== null && result !== undefined) return result
  }
  return undefined
}

async function runOnLoad(build: FakeBuild, path: string, namespace = ""): Promise<OnLoadResult | null | undefined> {
  for (const call of build.onLoadCalls) {
    if ((call.options.namespace ?? "") !== namespace) continue
    if (!call.options.filter.test(path)) continue
    const result = await call.callback({ path, namespace, suffix: "", pluginData: undefined, with: {} })
    if (result !== null && result !== undefined) return result
  }
  return undefined
}

const FAKE_BUILD_RESULT = { errors: [], warnings: [] } as unknown as BuildResult

let fixtureDir: string

beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), "mi-esbuild-plugin-"))
})

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true })
})

function writeFixture(name: string, contents: string): string {
  const path = join(fixtureDir, name)
  writeFileSync(path, contents)
  return path
}

const MITHRIL_SOURCE = `import m from "mithril"\nexport const A = { view: () => m("div.a", "hi") }\n`

describe("dev-only / minify gate (§2.1 analog, §12.4 AC: production/minified builds exclude inspector code)", () => {
  it("is active by default in a plain (non-minified) dev build", () => {
    const build = setupPlugin()
    expect(build.onResolveCalls.length).toBeGreaterThan(0)
    expect(build.onLoadCalls.length).toBeGreaterThan(0)
  })

  it("is inactive when the build is minified, even though NODE_ENV=development", () => {
    const build = setupPlugin({}, { minify: true })
    expect(build.onResolveCalls.length).toBe(0)
    expect(build.onLoadCalls.length).toBe(0)
  })

  it("stays active under minify when includeInProduction is set", () => {
    const build = setupPlugin({ includeInProduction: true }, { minify: true })
    expect(build.onResolveCalls.length).toBeGreaterThan(0)
    expect(build.onLoadCalls.length).toBeGreaterThan(0)
  })

  it("is fully inactive when disabled, regardless of minify", () => {
    const build = setupPlugin({ enabled: false }, {})
    expect(build.onResolveCalls.length).toBe(0)
    expect(build.onLoadCalls.length).toBe(0)
  })

  it("defaults to inactive when NODE_ENV=production", () => {
    const build = setupPlugin({}, {}, { NODE_ENV: "production" })
    expect(build.onResolveCalls.length).toBe(0)
    expect(build.onLoadCalls.length).toBe(0)
  })
})

describe("virtual module resolution (§11.2 analog via onResolve/onLoad)", () => {
  it("resolves the runtime and overlay specifiers into the virtual namespace", async () => {
    const build = setupPlugin()
    const runtime = await runOnResolve(build, RUNTIME_MODULE_ID)
    expect(runtime?.path).toBe(RESOLVED_RUNTIME_ID)
    expect(runtime?.namespace).toBeTruthy()

    const overlay = await runOnResolve(build, OVERLAY_MODULE_ID)
    expect(overlay?.path).toBe(RESOLVED_OVERLAY_ID)
    expect(overlay?.namespace).toBe(runtime?.namespace)
  })

  it("does not resolve unrelated specifiers", async () => {
    const build = setupPlugin()
    expect(await runOnResolve(build, "mithril")).toBeUndefined()
  })

  it("loads the runtime and overlay bootstrap modules in the virtual namespace", async () => {
    const build = setupPlugin({ mode: "full", source: { exposeDomAttributes: true } })
    const runtimeResolved = await runOnResolve(build, RUNTIME_MODULE_ID)
    const runtime = await runOnLoad(build, runtimeResolved!.path!, runtimeResolved!.namespace)
    expect(runtime?.contents).toContain("createRuntime")
    expect(runtime?.contents).toContain('"mode":"full"')
    expect(runtime?.contents).toContain('"exposeDomAttributes":true')
    expect(runtime?.loader).toBe("js")

    const overlayResolved = await runOnResolve(build, OVERLAY_MODULE_ID)
    const overlay = await runOnLoad(build, overlayResolved!.path!, overlayResolved!.namespace)
    expect(overlay?.contents).toContain("mountInspectorOverlay")
  })
})

describe("transform wiring and source-map pass-through (§12.4, real files via onLoad)", () => {
  it("instruments a Mithril module and appends a source-mapping-URL comment", async () => {
    const build = setupPlugin()
    const path = writeFixture("App.ts", MITHRIL_SOURCE)
    const result = await runOnLoad(build, path)
    expect(result).toBeDefined()
    expect(result!.contents).toContain("virtual:mithril-inspector/runtime")
    expect(result!.contents).toContain("__miRegisterModule")
    expect(result!.contents).toContain("//# sourceMappingURL=data:application/json")
    expect(result!.loader).toBe("ts")
  })

  it("selects the loader from the file extension (.tsx)", async () => {
    const build = setupPlugin()
    const path = writeFixture(
      "App.tsx",
      `import m from "mithril"\nexport const A = { view: () => <div class="a">hi</div> }\n`,
    )
    const result = await runOnLoad(build, path)
    expect(result?.loader).toBe("tsx")
  })

  it("returns undefined for a file with no Mithril usage", async () => {
    const build = setupPlugin()
    const path = writeFixture("plain.ts", "export const x = 1\n")
    expect(await runOnLoad(build, path)).toBeUndefined()
  })

  it("skips node_modules and the inspector's own packages without reading the file", async () => {
    const build = setupPlugin()
    // These paths don't exist on disk; a non-null result would mean the
    // plugin tried to read them instead of short-circuiting on the filter.
    expect(await runOnLoad(build, "/repo/node_modules/mithril/index.js")).toBeUndefined()
    expect(
      await runOnLoad(build, "/repo/node_modules/@mithril-inspector/overlay/dist/index.js"),
    ).toBeUndefined()
  })
})

describe("devServer option (§12.4 helper development server, wired via onEnd/onDispose)", () => {
  let servedir: string

  beforeEach(() => {
    servedir = mkdtempSync(join(tmpdir(), "mi-esbuild-plugin-devserver-"))
    writeFileSync(join(servedir, "index.html"), "<!doctype html><body>ok</body>")
  })

  afterEach(() => {
    rmSync(servedir, { recursive: true, force: true })
  })

  it("does not register onEnd/onDispose when devServer is not configured", () => {
    const build = setupPlugin()
    expect(build.onEndCalls.length).toBe(0)
    expect(build.onDisposeCalls.length).toBe(0)
  })

  it("starts the helper dev server once on the first successful onEnd, and closes it on dispose", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    try {
      const build = setupPlugin({ root: servedir, devServer: { servedir } })
      expect(build.onEndCalls.length).toBe(1)
      expect(build.onDisposeCalls.length).toBe(1)

      await build.onEndCalls[0]!(FAKE_BUILD_RESULT)
      await build.onEndCalls[0]!(FAKE_BUILD_RESULT) // a second rebuild must not start a second server

      const logged = logSpy.mock.calls.map((call) => String(call[0])).join("\n")
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(logged)
      expect(match).not.toBeNull()
      const url = match![0]

      const res = await fetch(`${url}/index.html`)
      expect(res.status).toBe(200)

      // Only one server was ever started — its URL only appears once.
      expect(logged.split(url).length - 1).toBe(1)

      build.onDisposeCalls[0]!()
      await new Promise((r) => setTimeout(r, 10))
      await expect(fetch(`${url}/index.html`)).rejects.toThrow()
    } finally {
      logSpy.mockRestore()
    }
  })

  it("mounts the open-in-editor endpoint on the helper dev server", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    try {
      const build = setupPlugin({ root: servedir, devServer: { servedir } })
      await build.onEndCalls[0]!(FAKE_BUILD_RESULT)
      const logged = logSpy.mock.calls.map((call) => String(call[0])).join("\n")
      const url = /http:\/\/127\.0\.0\.1:\d+/.exec(logged)![0]

      const res = await fetch(`${url}${OPEN_IN_EDITOR_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      })
      expect(res.status).toBe(400)

      build.onDisposeCalls[0]!()
    } finally {
      logSpy.mockRestore()
    }
  })
})
