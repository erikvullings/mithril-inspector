import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import webpack from "webpack"
import type { Configuration } from "webpack"

import { mithrilInspector } from "@mithril-inspector/webpack"

/**
 * A minimal end-to-end webpack build against a real fixture app (task 0025
 * AC: "one integration fixture per bundler"). `mithril` and the inspector's
 * own packages are marked `externals` — this proves the plugin's own wiring
 * (loader transform, resolve.alias virtual resolution, EntryPlugin injection,
 * the mode-based dev-only guard), not full application bundling, which is
 * out of scope for this package (mirrors the Rollup/esbuild fixture tests).
 */

const APP_MARKER = "UNIQUE_WEBPACK_FIXTURE_MARKER_25"
const EXTERNALS: NonNullable<Configuration["externals"]> = [/^mithril$/, /^@mithril-inspector\//]

let fixtureRoot: string

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "mi-webpack-fixture-"))
  mkdirSync(join(fixtureRoot, "src"), { recursive: true })
  // Assigns to a global rather than a bare unused export: webpack's
  // production-mode usedExports/Terser pass would otherwise tree-shake an
  // entry module's own never-imported export away entirely, which would
  // make this fixture useless for asserting on the *inspector's* output.
  writeFileSync(
    join(fixtureRoot, "src", "main.ts"),
    // The globalThis assignment is a side effect: without it webpack's
    // production-mode usedExports/Terser pass would tree-shake away the
    // never-imported `App` declaration entirely, making this fixture
    // useless for asserting on the *inspector's* injected output.
    `import m from "mithril"\nconst App = { view: () => m("div.app", "${APP_MARKER}") }\nglobalThis.__FIXTURE_APP__ = App\n`,
  )
})

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true })
})

function buildOnce(
  options: Parameters<typeof mithrilInspector>[0],
  mode: Configuration["mode"] = "development",
): Promise<string> {
  const outDir = join(fixtureRoot, "dist")
  const config: Configuration = {
    mode,
    context: fixtureRoot,
    entry: "./src/main.ts",
    output: { path: outDir, filename: "main.js" },
    externals: EXTERNALS,
    externalsType: "commonjs",
    devtool: false,
    plugins: [mithrilInspector(options, { NODE_ENV: "development" }) as never],
  }

  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) {
        reject(err)
        return
      }
      if (stats?.hasErrors()) {
        reject(new Error(stats.toString({ errorDetails: true })))
        return
      }
      const combined = readdirSync(outDir)
        .filter((file) => file.endsWith(".js"))
        .map((file) => readFileSync(join(outDir, file), "utf8"))
        .join("\n")
      resolve(combined)
    })
  })
}

describe("webpack fixture build (§12.5)", () => {
  it(
    "a production-mode build emits no inspector code by default (§2.1 analog)",
    async () => {
      const code = await buildOnce({}, "production")
      expect(code).toContain(APP_MARKER)
      expect(code).not.toContain("virtual:mithril-inspector")
      expect(code).not.toContain("__miRegisterModule")
      expect(code).not.toContain("__miSource")
      expect(code).not.toContain("createRuntime")
    },
    20_000,
  )

  it(
    "a development-mode build is active by default: transform applied, overlay entry injected, virtual runtime resolved",
    async () => {
      const code = await buildOnce({}, "development")
      expect(code).toContain(APP_MARKER)
      // webpack wraps namespaced calls as `(0, ns.registerModule)(...)` rather
      // than Rollup's hoisted bare `registerModule(...)`, so check the pieces
      // rather than one concatenated call-shaped substring.
      expect(code).toContain("registerModule")
      expect(code).toMatch(/"m:[a-z0-9]+"/)
      expect(code).toContain('"kind":"component-declaration"')
      // The overlay bootstrap was injected as a real entry (EntryPlugin) and
      // bundled — its own import of the runtime bootstrap ran mountInspectorOverlay.
      expect(code).toContain("mountInspectorOverlay")
      expect(code).toContain("createRuntime")
      // resolve.alias resolved the virtual specifier away — it should not
      // survive as literal unresolved text.
      expect(code).not.toContain("virtual:mithril-inspector/runtime")
    },
    20_000,
  )

  it(
    "includeInProduction forces activation in a production-mode build",
    async () => {
      const code = await buildOnce({ includeInProduction: true }, "production")
      expect(code).toContain(APP_MARKER)
      expect(code).toContain("createRuntime")
    },
    20_000,
  )

  it(
    "enabled:false stays inactive regardless of mode",
    async () => {
      const code = await buildOnce({ enabled: false, includeInProduction: true }, "production")
      expect(code).toContain(APP_MARKER)
      expect(code).not.toContain("virtual:mithril-inspector")
      expect(code).not.toContain("createRuntime")
    },
    20_000,
  )
})
