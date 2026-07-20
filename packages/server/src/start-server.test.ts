import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OPEN_IN_EDITOR_PATH } from "./handle-request.js"
import { startInspectorServer } from "./start-server.js"
import type { InspectorServerHandle } from "./start-server.js"

let root: string
let handle: InspectorServerHandle | undefined

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "mi-start-server-"))
  mkdirSync(path.join(root, "src"), { recursive: true })
  writeFileSync(path.join(root, "src", "foo.ts"), "export const foo = 1\n")
})

afterEach(async () => {
  rmSync(root, { recursive: true, force: true })
  await handle?.close()
  handle = undefined
})

describe("startInspectorServer (§12.3 — standalone inspector server)", () => {
  it("binds to an ephemeral port on 127.0.0.1 by default and reports its url", async () => {
    handle = await startInspectorServer({
      root,
      editor: "code",
      launchEditorProcess: vi.fn().mockResolvedValue(undefined),
    })
    expect(handle.port).toBeGreaterThan(0)
    expect(handle.url).toBe(`http://127.0.0.1:${handle.port}`)
  })

  it("serves the open-in-editor endpoint and returns ok:true", async () => {
    const launch = vi.fn().mockResolvedValue(undefined)
    handle = await startInspectorServer({ root, editor: "code", launchEditorProcess: launch })

    const response = await fetch(`${handle.url}${OPEN_IN_EDITOR_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "src/foo.ts", line: 3, column: 2 }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(launch).toHaveBeenCalledTimes(1)
  })

  it("still enforces the security pipeline (path traversal rejected)", async () => {
    handle = await startInspectorServer({
      root,
      editor: "code",
      launchEditorProcess: vi.fn().mockResolvedValue(undefined),
    })

    const response = await fetch(`${handle.url}${OPEN_IN_EDITOR_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "../../etc/passwd", line: 1, column: 1 }),
    })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe("FILE_OUTSIDE_ROOT")
  })

  it("responds 404 for any path other than the open-in-editor endpoint", async () => {
    handle = await startInspectorServer({
      root,
      editor: "code",
      launchEditorProcess: vi.fn().mockResolvedValue(undefined),
    })

    const response = await fetch(`${handle.url}/some/other/path`)
    expect(response.status).toBe(404)
  })

  it("respects an explicit port and host", async () => {
    handle = await startInspectorServer({
      root,
      editor: "code",
      launchEditorProcess: vi.fn().mockResolvedValue(undefined),
      host: "127.0.0.1",
      port: 0,
    })
    expect(handle.url.startsWith("http://127.0.0.1:")).toBe(true)
  })

  it("close() stops the server so further requests fail to connect", async () => {
    const started = await startInspectorServer({
      root,
      editor: "code",
      launchEditorProcess: vi.fn().mockResolvedValue(undefined),
    })
    const url = started.url
    await started.close()
    handle = undefined

    await expect(fetch(url)).rejects.toBeTruthy()
  })
})
