import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { extname, resolve, sep } from "node:path"

import { createInspectorMiddleware } from "@mithril-inspector/server"
import type { InspectorServerOptions } from "@mithril-inspector/server"

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
}

/** Options for {@link createEsbuildDevServer}: where to serve static files from, and the open-in-editor server options. */
export interface EsbuildDevServerOptions {
  /** Directory static requests are served from — typically the esbuild build's `outdir`/app root. */
  readonly servedir: string
  /** Same server options `@mithril-inspector/server`'s middleware takes (§10.2). */
  readonly inspector: InspectorServerOptions
  /** Port to listen on; `0` (default) picks an ephemeral free port. */
  readonly port?: number
  /** Host to bind. Defaults to `127.0.0.1` (loopback only), matching {@link createInspectorMiddleware}'s security posture (§10.2). */
  readonly host?: string
}

/** A running helper dev server (§12.4). */
export interface EsbuildDevServerHandle {
  readonly port: number
  readonly url: string
  close(): Promise<void>
}

function resolveStaticPath(root: string, urlPath: string): string | null {
  const pathname = decodeURIComponent(urlPath.split("?", 1)[0] ?? "/")
  const target = resolve(root, `.${pathname}`)
  if (target !== root && !target.startsWith(root + sep)) return null
  return target
}

async function readStaticFile(root: string, urlPath: string): Promise<{ path: string; contents: Buffer } | null> {
  const target = resolveStaticPath(root, urlPath)
  if (target === null) return null
  try {
    const info = await stat(target)
    const filePath = info.isDirectory() ? resolve(target, "index.html") : target
    const contents = await readFile(filePath)
    return { path: filePath, contents }
  } catch {
    return null
  }
}

/**
 * A minimal static-file dev server for esbuild output, with the
 * open-in-editor middleware mounted at the same origin (§12.4) — unlike
 * Vite's `configureServer`/Rollup's documented companion-server pattern,
 * esbuild's own `context().serve()` has no middleware hook to attach the
 * editor endpoint to, so this reuses `@mithril-inspector/server`'s
 * `createInspectorMiddleware` directly in front of a small static file
 * handler instead.
 */
export function createEsbuildDevServer(options: EsbuildDevServerOptions): Promise<EsbuildDevServerHandle> {
  const editorMiddleware = createInspectorMiddleware(options.inspector)
  const root = resolve(options.servedir)

  const server = createServer((req, res) => {
    editorMiddleware(req, res, () => {
      readStaticFile(root, req.url ?? "/")
        .then((file) => {
          if (file === null) {
            res.statusCode = 404
            res.end("Not found")
            return
          }
          res.statusCode = 200
          res.setHeader("Content-Type", MIME_TYPES[extname(file.path)] ?? "application/octet-stream")
          res.end(file.contents)
        })
        .catch(() => {
          res.statusCode = 500
          res.end("Internal server error")
        })
    })
  })

  return new Promise((resolvePromise, reject) => {
    const onError = (error: Error): void => reject(error)
    server.once("error", onError)
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => {
      server.removeListener("error", onError)
      const address = server.address() as AddressInfo
      const host = options.host ?? "127.0.0.1"
      resolvePromise({
        port: address.port,
        url: `http://${host}:${address.port}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((error) => (error ? rejectClose(error) : resolveClose()))
          }),
      })
    })
  })
}
