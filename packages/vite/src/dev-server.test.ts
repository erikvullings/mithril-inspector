import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createServer, type ViteDevServer } from "vite"

import { OVERLAY_MODULE_ID, RESOLVED_OVERLAY_ID, RUNTIME_MODULE_ID } from "@mithril-inspector/adapter-kit"

import { mithrilInspector } from "./plugin.js"

/**
 * Integration check against a *real* Vite dev server (no browser): virtual
 * modules resolve/load through the actual module pipeline, and the injected
 * inline overlay-bootstrap import is rewritten by Vite in dev so the
 * application entry file is never touched (§2.2, §11.2).
 */

const here = dirname(fileURLToPath(import.meta.url))
let fixtureRoot: string
let server: ViteDevServer

beforeAll(async () => {
  fixtureRoot = mkdtempSync(join(here, "..", ".build-test-dev-"))
  writeFileSync(
    join(fixtureRoot, "index.html"),
    `<!DOCTYPE html><html><head></head><body></body></html>`,
  )
  server = await createServer({
    root: fixtureRoot,
    logLevel: "silent",
    configFile: false,
    plugins: mithrilInspector({ enabled: true }, { NODE_ENV: "development" }),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  })
}, 30_000)

afterAll(async () => {
  await server?.close()
  if (fixtureRoot !== undefined && existsSync(fixtureRoot)) rmSync(fixtureRoot, { recursive: true, force: true })
})

describe("dev server integration (§11.2)", () => {
  it("serves the runtime virtual module through the real pipeline", async () => {
    const result = await server.transformRequest(RUNTIME_MODULE_ID)
    expect(result).not.toBeNull()
    expect(result!.code).toContain("createRuntime")
    expect(result!.code).toContain("invalidateModule")
  })

  it("serves the overlay virtual module through the real pipeline", async () => {
    const result = await server.transformRequest(OVERLAY_MODULE_ID)
    expect(result).not.toBeNull()
    expect(result!.code).toContain("mountInspectorOverlay")
  })

  it("injects a served overlay-bootstrap URL into the HTML (no entry edit)", async () => {
    const html = await server.transformIndexHtml(
      "/index.html",
      `<!DOCTYPE html><html><head></head><body></body></html>`,
    )
    // A served /@id/ URL the browser can actually load — not a bare inline
    // `import "virtual:…"`, which Vite does not rewrite in an injected inline
    // script and would 404.
    expect(html).toContain("/@id/")
    expect(html).toContain("virtual:mithril-inspector/overlay")
    expect(html).not.toMatch(/<script[^>]*>\s*import\s*["']virtual:mithril-inspector\/overlay["']/)
  })

  it("serves the /@id/ target (the resolved overlay id) through the pipeline", async () => {
    const result = await server.transformRequest(RESOLVED_OVERLAY_ID)
    expect(result).not.toBeNull()
    expect(result!.code).toContain("mountInspectorOverlay")
  })
})
