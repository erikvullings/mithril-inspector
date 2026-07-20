import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { rollup, watch } from "rollup"
import type { RollupWatcherEvent } from "rollup"

import { mithrilInspector } from "@mithril-inspector/rollup"

/**
 * A minimal end-to-end Rollup build against a real fixture app (task 0023
 * AC: "a minimal fixture build in tests/integration/"). `mithril` and the
 * inspector's own packages are marked `external` — this proves the plugin's
 * own wiring (transform, virtual module resolution, dev-only guard), not
 * full application bundling, which is out of scope for this package.
 */

const APP_MARKER = "UNIQUE_ROLLUP_FIXTURE_MARKER_23"
const EXTERNAL = ["mithril", /^@mithril-inspector\//]

let fixtureRoot: string

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "mi-rollup-fixture-"))
  mkdirSync(join(fixtureRoot, "src"), { recursive: true })
  writeFileSync(
    join(fixtureRoot, "src", "main.ts"),
    `import m from "mithril"\nexport const App = { view: () => m("div.app", "${APP_MARKER}") }\n`,
  )
})

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true })
})

async function buildOnce(options: Parameters<typeof mithrilInspector>[0]): Promise<string> {
  const bundle = await rollup({
    input: join(fixtureRoot, "src", "main.ts"),
    external: EXTERNAL,
    plugins: [mithrilInspector(options, { NODE_ENV: "development" })],
    onwarn: () => {},
  })
  try {
    const { output } = await bundle.generate({ format: "esm" })
    return output.map((chunk) => (chunk.type === "chunk" ? chunk.code : "")).join("\n")
  } finally {
    await bundle.close()
  }
}

describe("rollup fixture build (§12.3)", () => {
  it("a plain one-off build (no watch mode) emits no inspector code by default (§2.1 analog)", async () => {
    const code = await buildOnce({})
    expect(code).toContain(APP_MARKER)
    expect(code).not.toContain("virtual:mithril-inspector")
    expect(code).not.toContain("__miRegisterModule")
    expect(code).not.toContain("__miSource")
    expect(code).not.toContain("createRuntime")
  })

  it("includeInProduction forces transform + virtual runtime resolution into a one-off build", async () => {
    const code = await buildOnce({ includeInProduction: true })
    expect(code).toContain(APP_MARKER)
    // Rollup fully bundles the virtual runtime module into the same chunk
    // (unlike Vite's unbundled dev server), so its scope-hoisting collapses
    // the transform's `registerModule as __miRegisterModule` import alias
    // back onto the canonical exported name — the call is still present,
    // just spelled `registerModule(...)` / `component(...)` / `source(...)`
    // in the merged output rather than `__miRegisterModule(...)`.
    expect(code).toContain('registerModule("m:')
    expect(code).toContain('component("m:')
    expect(code).toContain('source("m:')
    expect(code).toContain('"kind":"component-declaration"')
    // The virtual runtime module resolved/loaded through the real pipeline,
    // not just referenced by specifier.
    expect(code).toContain("createRuntime")
    expect(code).not.toContain("virtual:mithril-inspector/runtime")
  })

  it(
    "a real rollup.watch() cycle activates the plugin by default (dev-only guard)",
    async () => {
      const outDir = join(fixtureRoot, "dist")
      const watcher = watch({
        input: join(fixtureRoot, "src", "main.ts"),
        external: EXTERNAL,
        plugins: [mithrilInspector({}, { NODE_ENV: "development" })],
        output: { dir: outDir, format: "esm" },
        onwarn: () => {},
      })

      try {
        await new Promise<void>((resolve, reject) => {
          watcher.on("event", (event: RollupWatcherEvent) => {
            if (event.code === "BUNDLE_END") {
              void event.result.close().then(resolve, reject)
            } else if (event.code === "ERROR") {
              reject(event.error)
            }
          })
        })

        const combined = readdirSync(outDir)
          .map((file) => readFileSync(join(outDir, file), "utf8"))
          .join("\n")
        expect(combined).toContain(APP_MARKER)
        expect(combined).toContain('registerModule("m:')
        expect(combined).toContain("createRuntime")
      } finally {
        await watcher.close()
      }
    },
    20_000,
  )
})
