import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { rspack } from "@rspack/core"
import type { Configuration } from "@rspack/core"

import { mithrilInspector } from "@mithril-inspector/webpack"

/**
 * The same `@mithril-inspector/webpack` plugin/loader, run against a real
 * Rspack compiler instead of webpack (task 0025 AC: "Rspack compatibility
 * verified... one integration fixture per bundler"). Nothing in the plugin
 * imports `@rspack/core`; this test is the actual verification that the
 * webpack-typed code (`compiler.rspack.EntryPlugin` backref, `module.rules`/
 * `resolve.alias` config mutation, the CJS loader) genuinely works
 * unmodified on Rspack's own compiler, not just in theory (§25.9).
 */

const APP_MARKER = "UNIQUE_RSPACK_FIXTURE_MARKER_25"
const EXTERNALS: NonNullable<Configuration["externals"]> = [/^mithril$/, /^@mithril-inspector\//]

let fixtureRoot: string

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "mi-rspack-fixture-"))
  mkdirSync(join(fixtureRoot, "src"), { recursive: true })
  writeFileSync(
    join(fixtureRoot, "src", "main.ts"),
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
    rspack(config, (err, stats) => {
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

describe("Rspack fixture build (§12.5 — cross-bundler verification)", () => {
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
    "a development-mode build is active by default: transform applied via compiler.rspack.EntryPlugin, virtual runtime resolved",
    async () => {
      const code = await buildOnce({}, "development")
      expect(code).toContain(APP_MARKER)
      expect(code).toContain("registerModule")
      expect(code).toMatch(/"m:[a-z0-9]+"/)
      expect(code).toContain('"kind":"component-declaration"')
      expect(code).toContain("mountInspectorOverlay")
      expect(code).toContain("createRuntime")
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
