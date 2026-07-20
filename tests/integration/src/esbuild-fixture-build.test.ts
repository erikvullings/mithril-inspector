import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as esbuild from "esbuild"

import { mithrilInspector } from "@mithril-inspector/esbuild"

/**
 * A minimal end-to-end esbuild build against a real fixture app (task 0024
 * AC: "integration fixture build"). `mithril` and the inspector's own
 * packages are marked `external` — this proves the plugin's own wiring
 * (onResolve/onLoad, virtual module resolution, the minify/dev-only guard),
 * not full application bundling, which is out of scope for this package.
 */

const APP_MARKER = "UNIQUE_ESBUILD_FIXTURE_MARKER_24"
const EXTERNAL = ["mithril", "@mithril-inspector/*"]

let fixtureRoot: string

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "mi-esbuild-fixture-"))
  mkdirSync(join(fixtureRoot, "src"), { recursive: true })
  writeFileSync(
    join(fixtureRoot, "src", "main.ts"),
    `import m from "mithril"\nexport const App = { view: () => m("div.app", "${APP_MARKER}") }\n`,
  )
})

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true })
})

async function buildOnce(
  options: Parameters<typeof mithrilInspector>[0],
  initialOptions: Partial<esbuild.BuildOptions> = {},
): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [join(fixtureRoot, "src", "main.ts")],
    bundle: true,
    write: false,
    format: "esm",
    external: EXTERNAL,
    logLevel: "silent",
    plugins: [mithrilInspector(options, { NODE_ENV: "development" })],
    ...initialOptions,
  })
  return (result.outputFiles ?? []).map((file) => file.text).join("\n")
}

describe("esbuild fixture build (§12.4)", () => {
  it("a minified build emits no inspector code by default (§2.1 analog: minify is the production signal)", async () => {
    const code = await buildOnce({}, { minify: true })
    expect(code).toContain(APP_MARKER)
    expect(code).not.toContain("virtual:mithril-inspector")
    expect(code).not.toContain("__miRegisterModule")
    expect(code).not.toContain("__miSource")
    expect(code).not.toContain("createRuntime")
  })

  it("a plain non-minified dev build is active by default and resolves the virtual runtime through onResolve/onLoad", async () => {
    const code = await buildOnce({})
    expect(code).toContain(APP_MARKER)
    // The virtual runtime module was actually resolved+loaded through the
    // real onResolve/onLoad pipeline (not just referenced by specifier) and
    // esbuild inlines/scope-hoists it into the same output (only a
    // namespace-identifying comment esbuild itself emits keeps the raw
    // specifier text; no executable import statement targets it anymore).
    expect(code).not.toMatch(/\bimport\b[^\n]*from\s*"virtual:mithril-inspector\/runtime"/)
    expect(code).toContain("createRuntime")
    expect(code).toContain('registerModule("m:')
    // esbuild reparses and reprints the instrumented registration payload as
    // part of bundling (its own printer, not the original transform text),
    // which normalizes object-literal spacing — hence the space after ":".
    expect(code).toContain('"kind": "component-declaration"')
    // @mithril-inspector/runtime itself is external here (see EXTERNAL) so
    // the virtual module's own re-export of it survives as a literal import.
    expect(code).toContain("@mithril-inspector/runtime")
  })

  it("includeInProduction forces the plugin into a minified build too", async () => {
    const code = await buildOnce({ includeInProduction: true }, { minify: true })
    expect(code).toContain(APP_MARKER)
    expect(code).toContain("createRuntime")
    expect(code).not.toContain("virtual:mithril-inspector/runtime")
  })

  it("enabled:false stays fully inactive regardless of minify", async () => {
    const code = await buildOnce({ enabled: false, includeInProduction: true })
    expect(code).toContain(APP_MARKER)
    expect(code).not.toContain("virtual:mithril-inspector")
    expect(code).not.toContain("createRuntime")
  })

  it(
    "a real esbuild.context()/watch() cycle activates the plugin by default",
    async () => {
      const outfile = join(fixtureRoot, "dist", "main.js")
      const ctx = await esbuild.context({
        entryPoints: [join(fixtureRoot, "src", "main.ts")],
        bundle: true,
        outfile,
        format: "esm",
        external: EXTERNAL,
        logLevel: "silent",
        plugins: [mithrilInspector({}, { NODE_ENV: "development" })],
      })

      try {
        await ctx.watch()
        await ctx.rebuild()
        const code = readFileSync(outfile, "utf8")
        expect(code).toContain(APP_MARKER)
        expect(code).toContain("createRuntime")
      } finally {
        await ctx.dispose()
      }
    },
    20_000,
  )
})
