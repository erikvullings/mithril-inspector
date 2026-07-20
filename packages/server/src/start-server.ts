import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import type { InspectorServerOptions } from "./handle-request.js"
import { createInspectorMiddleware } from "./middleware.js"

/**
 * Options for {@link startInspectorServer}: the same server options every
 * adapter passes to {@link createInspectorMiddleware}, plus where to listen.
 */
export interface StartInspectorServerOptions extends InspectorServerOptions {
  /** Port to listen on; `0` (default) picks an ephemeral free port. */
  readonly port?: number
  /**
   * Host to bind. Defaults to `127.0.0.1` (loopback only) — this endpoint can
   * launch editor processes, so it must never bind to a network-reachable
   * address by default (§10.2). No CORS headers are added, so a browser page
   * on a different origin cannot call it directly; pair it with a same-origin
   * reverse proxy or a dev server that mounts {@link createInspectorMiddleware}
   * itself.
   */
  readonly host?: string
}

/** A running standalone inspector server (§12.3). */
export interface InspectorServerHandle {
  /** The bound port. */
  readonly port: number
  /** `http://<host>:<port>`, the base URL the open-in-editor endpoint is served at. */
  readonly url: string
  /** Stop listening and release the port. Idempotent. */
  close(): Promise<void>
}

/**
 * Start a standalone HTTP server serving only the open-in-editor endpoint
 * (§12.2, §12.3) — for bundlers with no development-server hook of their own
 * (e.g. `@mithril-inspector/rollup`). Not a general-purpose dev server: any
 * request whose path does not match the open-in-editor path gets a plain 404.
 */
export function startInspectorServer(options: StartInspectorServerOptions): Promise<InspectorServerHandle> {
  const middleware = createInspectorMiddleware(options)
  const server = createServer((req, res) => {
    middleware(req, res, () => {
      res.statusCode = 404
      res.end()
    })
  })

  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error)
    server.once("error", onError)
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => {
      server.removeListener("error", onError)
      const address = server.address() as AddressInfo
      const host = options.host ?? "127.0.0.1"
      resolve({
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
