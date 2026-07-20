import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { WEBPACK_SAFE_RUNTIME_SPECIFIER, writeBootstrapFiles } from "./virtual-files.js"

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mi-webpack-virtual-files-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("writeBootstrapFiles (§12.5 — virtual/runtime entry injection)", () => {
  it("writes the runtime and overlay bootstrap files under node_modules/.cache so package resolution reaches the project's own node_modules", () => {
    const written = writeBootstrapFiles(
      root,
      { mode: "source", debug: false, exposeDomAttributes: false, redact: { keys: [], replacement: "[redacted]" } },
      { enabled: true, defaultOpen: false, theme: "system" },
    )

    expect(written.runtimePath).toBe(join(root, "node_modules", ".cache", "mithril-inspector", "runtime-bootstrap.js"))
    expect(written.overlayPath).toBe(join(root, "node_modules", ".cache", "mithril-inspector", "overlay-bootstrap.js"))

    const runtimeCode = readFileSync(written.runtimePath, "utf8")
    expect(runtimeCode).toContain("createRuntime")
    expect(runtimeCode).toContain('"mode":"source"')

    const overlayCode = readFileSync(written.overlayPath, "utf8")
    expect(overlayCode).toContain("mountInspectorOverlay")
    // webpack treats any "scheme:"-shaped specifier (e.g. "virtual:...", the
    // convention every other adapter uses) as a URI and bypasses
    // resolve.alias entirely (UnhandledSchemeError) — the overlay bootstrap's
    // otherwise-hardcoded runtime import is rewritten to a colon-free
    // specifier so it stays alias-resolvable (§25.9 divergence).
    expect(overlayCode).not.toContain("virtual:mithril-inspector/runtime")
    expect(overlayCode).toContain(WEBPACK_SAFE_RUNTIME_SPECIFIER)
  })

  it("creates the cache directory when it does not exist yet", () => {
    const nested = join(root, "does", "not", "exist", "yet")
    const written = writeBootstrapFiles(
      nested,
      { mode: "source", debug: false, exposeDomAttributes: false, redact: { keys: [], replacement: "[redacted]" } },
      { enabled: true, defaultOpen: false, theme: "system" },
    )
    expect(readFileSync(written.runtimePath, "utf8")).toContain("createRuntime")
  })
})
