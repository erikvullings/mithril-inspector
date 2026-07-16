import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import type { Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { InspectorServerOptions } from "./handle-request.js"
import { OPEN_IN_EDITOR_PATH } from "./handle-request.js"
import { createInspectorMiddleware } from "./middleware.js"

let root: string
let server: Server | undefined

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "mi-middleware-"))
  mkdirSync(path.join(root, "src"), { recursive: true })
  writeFileSync(path.join(root, "src", "foo.ts"), "export const foo = 1\n")
})

afterEach(async () => {
  rmSync(root, { recursive: true, force: true })
  if (server?.listening) {
    await new Promise<void>((resolve) => server?.close(() => resolve()))
  }
  server = undefined
})

function start(options: InspectorServerOptions): Promise<string> {
  const middleware = createInspectorMiddleware(options)
  server = createServer((req, res) => {
    middleware(req, res, () => {
      res.statusCode = 404
      res.end("not-handled")
    })
  })
  return new Promise((resolve) => {
    const activeServer = server
    if (activeServer === undefined) throw new Error("server was not created")
    activeServer.listen(0, "127.0.0.1", () => {
      const address = activeServer.address()
      if (address === null || typeof address === "string") throw new Error("expected a network address")
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

describe("createInspectorMiddleware", () => {
  it("passes through requests for other paths to next()", async () => {
    const baseUrl = await start({
      root,
      editor: "code",
      launchEditorProcess: vi.fn().mockResolvedValue(undefined),
    })
    const response = await fetch(`${baseUrl}/some/other/path`)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe("not-handled")
  })

  it("serves the open-in-editor endpoint and returns ok:true", async () => {
    const launch = vi.fn().mockResolvedValue(undefined)
    const baseUrl = await start({ root, editor: "code", launchEditorProcess: launch })
    const response = await fetch(`${baseUrl}${OPEN_IN_EDITOR_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "src/foo.ts", line: 3, column: 2 }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(launch).toHaveBeenCalledTimes(1)
  })

  it("ignores a query string when matching the endpoint path", async () => {
    const launch = vi.fn().mockResolvedValue(undefined)
    const baseUrl = await start({ root, editor: "code", launchEditorProcess: launch })
    const response = await fetch(`${baseUrl}${OPEN_IN_EDITOR_PATH}?foo=bar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "src/foo.ts", line: 1, column: 1 }),
    })
    expect(response.status).toBe(200)
  })

  it("rejects a GET request to the endpoint with 405", async () => {
    const baseUrl = await start({
      root,
      editor: "code",
      launchEditorProcess: vi.fn().mockResolvedValue(undefined),
    })
    const response = await fetch(`${baseUrl}${OPEN_IN_EDITOR_PATH}`)
    expect(response.status).toBe(405)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED")
  })

  it("rejects a request whose body exceeds maxBodyBytes while streaming", async () => {
    const baseUrl = await start({
      root,
      editor: "code",
      launchEditorProcess: vi.fn().mockResolvedValue(undefined),
      maxBodyBytes: 32,
    })
    const response = await fetch(`${baseUrl}${OPEN_IN_EDITOR_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "src/foo.ts", line: 1, column: 1, padding: "x".repeat(500) }),
    })
    expect(response.status).toBe(413)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe("BODY_TOO_LARGE")
  })

  it("rejects path traversal through the real HTTP path", async () => {
    const baseUrl = await start({
      root,
      editor: "code",
      launchEditorProcess: vi.fn().mockResolvedValue(undefined),
    })
    const response = await fetch(`${baseUrl}${OPEN_IN_EDITOR_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "../../etc/passwd", line: 1, column: 1 }),
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe("FILE_OUTSIDE_ROOT")
  })
})
