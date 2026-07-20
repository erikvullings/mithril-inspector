import { describe, expect, it, vi } from "vitest"

import { runMithrilInspectorLoader } from "./loader.js"
import type { LoaderCallback, LoaderThis } from "./loader.js"

function fakeContext(resourcePath: string, options: Record<string, unknown> = {}): LoaderThis {
  return { resourcePath, getOptions: () => options }
}

describe("runMithrilInspectorLoader (§12.5 — loader calls the shared transformMithrilModule)", () => {
  it("instruments a Mithril module and reports the transformed code + map via the callback", () => {
    const callback: LoaderCallback = vi.fn()
    const source = 'import m from "mithril"\nexport const App = { view: () => m("div", "hi") }\n'

    runMithrilInspectorLoader(fakeContext("/app/src/App.ts"), source, undefined, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    const [error, code, map] = (callback as ReturnType<typeof vi.fn>).mock.calls[0] as [
      unknown,
      string,
      unknown,
    ]
    expect(error).toBeNull()
    expect(code).toContain("__miRegisterModule")
    expect(code).not.toBe(source)
    expect(map).toBeDefined()
  })

  it("passes non-Mithril source through unchanged (transform returns null)", () => {
    const callback: LoaderCallback = vi.fn()
    const source = "export const notMithril = 1\n"

    runMithrilInspectorLoader(fakeContext("/app/src/plain.ts"), source, undefined, callback)

    expect(callback).toHaveBeenCalledWith(null, source, undefined)
  })

  it("skips node_modules dependencies without attempting a transform", () => {
    const callback: LoaderCallback = vi.fn()
    const source = 'import m from "mithril"\nexport const App = { view: () => m("div") }\n'

    runMithrilInspectorLoader(fakeContext("/app/node_modules/some-lib/index.js"), source, undefined, callback)

    expect(callback).toHaveBeenCalledWith(null, source, undefined)
  })

  it("skips the inspector's own packages without attempting a transform", () => {
    const callback: LoaderCallback = vi.fn()
    const source = 'import m from "mithril"\nexport const App = { view: () => m("div") }\n'

    runMithrilInspectorLoader(
      fakeContext("/app/node_modules/@mithril-inspector/runtime/dist/index.js"),
      source,
      undefined,
      callback,
    )

    expect(callback).toHaveBeenCalledWith(null, source, undefined)
  })

  it("forwards an incoming source map when the transform does not produce one", () => {
    const callback: LoaderCallback = vi.fn()
    const source = "export const notMithril = 1\n"
    const inputMap = { version: 3, sources: [], names: [], mappings: "" }

    runMithrilInspectorLoader(fakeContext("/app/src/plain.ts"), source, inputMap, callback)

    expect(callback).toHaveBeenCalledWith(null, source, inputMap)
  })

  it("reports a caught transform error via the callback instead of throwing", () => {
    const callback: LoaderCallback = vi.fn()
    // A syntax error the parser cannot recover from.
    const source = "export const broken = ("

    runMithrilInspectorLoader(fakeContext("/app/src/broken.ts"), source, undefined, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    const [error] = (callback as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown]
    // transformMithrilModule already swallows parse errors into `null` (§9
    // fixture behaviour) rather than throwing, so this should still pass
    // the source through rather than erroring the build.
    expect(error).toBeNull()
  })

  it("passes loader options through to the shared transform (custom runtimeModule)", () => {
    const callback: LoaderCallback = vi.fn()
    const source = 'import m from "mithril"\nexport const App = { view: () => m("div", "hi") }\n'

    runMithrilInspectorLoader(
      fakeContext("/app/src/App.ts", { runtimeModule: "virtual:mithril-inspector/runtime" }),
      source,
      undefined,
      callback,
    )

    const [, code] = (callback as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, string]
    expect(code).toContain("virtual:mithril-inspector/runtime")
  })
})
