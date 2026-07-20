import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { OPEN_IN_EDITOR_PATH } from "@mithril-inspector/server"

import { createEsbuildDevServer } from "./dev-server.js"
import type { EsbuildDevServerHandle } from "./dev-server.js"

let servedir: string
let handle: EsbuildDevServerHandle | undefined

beforeEach(() => {
  servedir = mkdtempSync(join(tmpdir(), "mi-esbuild-devserver-"))
  mkdirSync(join(servedir, "nested"), { recursive: true })
  writeFileSync(join(servedir, "index.html"), "<!doctype html><body>root</body>")
  writeFileSync(join(servedir, "nested", "index.html"), "<!doctype html><body>nested</body>")
  writeFileSync(join(servedir, "app.js"), "console.log('app')")
})

afterEach(async () => {
  await handle?.close()
  handle = undefined
  rmSync(servedir, { recursive: true, force: true })
})

describe("createEsbuildDevServer (§12.4 helper development server)", () => {
  it("serves static files from servedir with the right content type", async () => {
    handle = await createEsbuildDevServer({ servedir, inspector: { root: servedir } })
    const res = await fetch(`${handle.url}/app.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("javascript")
    expect(await res.text()).toBe("console.log('app')")
  })

  it("serves index.html for a directory request, including the root", async () => {
    handle = await createEsbuildDevServer({ servedir, inspector: { root: servedir } })

    const root = await fetch(handle.url + "/")
    expect(await root.text()).toContain("root")

    const nested = await fetch(`${handle.url}/nested/`)
    expect(await nested.text()).toContain("nested")
  })

  it("returns 404 for a missing file", async () => {
    handle = await createEsbuildDevServer({ servedir, inspector: { root: servedir } })
    const res = await fetch(`${handle.url}/does-not-exist.js`)
    expect(res.status).toBe(404)
  })

  it("rejects path traversal outside servedir", async () => {
    handle = await createEsbuildDevServer({ servedir, inspector: { root: servedir } })
    const res = await fetch(`${handle.url}/../../etc/passwd`, { redirect: "manual" })
    expect(res.status).toBe(404)
  })

  it("mounts the open-in-editor middleware at the same origin, before falling back to static files", async () => {
    handle = await createEsbuildDevServer({ servedir, inspector: { root: servedir } })
    const res = await fetch(`${handle.url}${OPEN_IN_EDITOR_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    })
    expect(res.status).toBe(400)
    const json = (await res.json()) as { ok: boolean; error: { code: string } }
    expect(json.ok).toBe(false)
    expect(json.error.code).toBe("INVALID_JSON")
  })

  it("binds to an ephemeral loopback port by default and close() releases it", async () => {
    handle = await createEsbuildDevServer({ servedir, inspector: { root: servedir } })
    expect(handle.port).toBeGreaterThan(0)
    expect(handle.url).toBe(`http://127.0.0.1:${handle.port}`)
    await handle.close()
    await expect(fetch(`${handle.url}/app.js`)).rejects.toThrow()
    handle = undefined
  })
})
