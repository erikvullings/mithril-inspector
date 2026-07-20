import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import type { Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { InspectorServerOptions } from "@mithril-inspector/server"

import { wireDevServerMiddleware } from "./dev-server.js"
import type { DevServerLikeConfig } from "./dev-server.js"

let root: string
let server: Server | undefined

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "mi-webpack-devserver-"))
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

function startWithSetupMiddlewares(devServer: DevServerLikeConfig): Promise<string> {
  const middlewares = devServer.setupMiddlewares?.([], { app: undefined } as never) ?? []
  server = createServer((req, res) => {
    const run = (index: number): void => {
      const middleware = middlewares[index]
      if (middleware === undefined) {
        res.statusCode = 404
        res.end("not-handled")
        return
      }
      ;(middleware as (req: unknown, res: unknown, next: () => void) => void)(req, res, () => run(index + 1))
    }
    run(0)
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

function inspectorOptions(): InspectorServerOptions {
  return { root, editor: "code", launchEditorProcess: vi.fn() }
}

describe("wireDevServerMiddleware (§12.5 — dev-server middleware for editor launching)", () => {
  it("adds the open-in-editor middleware to an empty devServer config", async () => {
    const devServer = wireDevServerMiddleware(undefined, inspectorOptions())
    const baseUrl = await startWithSetupMiddlewares(devServer)

    const response = await fetch(`${baseUrl}/__mithril-inspector/open-in-editor`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "src/foo.ts", line: 1, column: 1 }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it("passes through unrelated requests to the next middleware/404", async () => {
    const devServer = wireDevServerMiddleware(undefined, inspectorOptions())
    const baseUrl = await startWithSetupMiddlewares(devServer)

    const response = await fetch(`${baseUrl}/some/other/path`)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe("not-handled")
  })

  it("composes with an existing setupMiddlewares instead of replacing it", async () => {
    const existing = vi.fn((middlewares: unknown[]) => {
      ;(middlewares as Array<(req: unknown, res: unknown, next: () => void) => void>).push((_req, res) => {
        ;(res as { statusCode: number; end: (body: string) => void }).statusCode = 200
        ;(res as { end: (body: string) => void }).end("from-existing")
      })
      return middlewares
    })
    const devServer = wireDevServerMiddleware({ setupMiddlewares: existing }, inspectorOptions())
    const baseUrl = await startWithSetupMiddlewares(devServer)

    expect(existing).toHaveBeenCalledTimes(1)

    const editorResponse = await fetch(`${baseUrl}/__mithril-inspector/open-in-editor`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "src/foo.ts", line: 1, column: 1 }),
    })
    expect(editorResponse.status).toBe(200)
    expect(await editorResponse.json()).toEqual({ ok: true })

    const otherResponse = await fetch(`${baseUrl}/anything-else`)
    expect(await otherResponse.text()).toBe("from-existing")
  })

  it("preserves other devServer config fields untouched", () => {
    const devServer = wireDevServerMiddleware({ port: 1234, host: "0.0.0.0" }, inspectorOptions())
    expect(devServer.port).toBe(1234)
    expect(devServer.host).toBe("0.0.0.0")
    expect(typeof devServer.setupMiddlewares).toBe("function")
  })
})
