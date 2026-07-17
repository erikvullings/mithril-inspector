import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { build } from "vite"

import { mithrilInspector } from "./plugin.js"

/**
 * §20.1.12 / AC: a production build must contain no runtime registration,
 * overlay, or editor endpoint. This runs a real `vite build` of a real Mithril
 * app with the plugin present but `enabled` — proving that the command-based
 * auto-disable (§2.1), not merely an app without Mithril, keeps the output
 * pristine.
 */

const here = dirname(fileURLToPath(import.meta.url))
const APP_MARKER = "UNIQUE_APP_MARKER_42"

let fixtureRoot: string

function collectOutput(dir: string): string {
  let combined = ""
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    combined += entry.isDirectory() ? collectOutput(full) : readFileSync(full, "utf8")
  }
  return combined
}

beforeAll(() => {
  // The fixture lives under the package so Node/Vite resolve `mithril` from the
  // workspace store while walking up from the fixture root.
  fixtureRoot = mkdtempSync(join(here, "..", ".build-test-"))
  mkdirSync(join(fixtureRoot, "src"), { recursive: true })
  writeFileSync(
    join(fixtureRoot, "index.html"),
    `<!DOCTYPE html><html><head></head><body><script type="module" src="/src/main.ts"></script></body></html>`,
  )
  writeFileSync(
    join(fixtureRoot, "src", "main.ts"),
    `import m from "mithril"\nconst App = { view: () => m("div.app", "${APP_MARKER}") }\nm.mount(document.body, App)\n`,
  )
})

afterAll(() => {
  if (fixtureRoot !== undefined && existsSync(fixtureRoot)) rmSync(fixtureRoot, { recursive: true, force: true })
})

describe("production build exclusion (§20.1.12)", () => {
  it(
    "emits no runtime, overlay or endpoint even with the plugin enabled",
    async () => {
      const outDir = join(fixtureRoot, "dist")
      await build({
        root: fixtureRoot,
        logLevel: "silent",
        configFile: false,
        // enabled:true isolates the command-based build exclusion (§2.1) as the
        // only reason the plugin stays out of the bundle.
        plugins: mithrilInspector({ enabled: true }, { NODE_ENV: "development" }),
        build: { outDir, emptyOutDir: true, minify: false, write: true },
      })

      const output = collectOutput(outDir)

      // The build actually ran and included the application code…
      expect(output).toContain(APP_MARKER)
      // …but not a trace of the inspector.
      expect(output).not.toContain("virtual:mithril-inspector")
      expect(output).not.toContain("__miRegisterModule")
      expect(output).not.toContain("__miSource")
      expect(output).not.toContain("mountInspectorOverlay")
      expect(output).not.toContain("__mithril-inspector")
      expect(output).not.toContain("open-in-editor")
    },
    30_000,
  )
})
