import type { IncomingMessage, ServerResponse } from "node:http"

import type connect from "connect"

import { DEFAULT_MAX_BODY_BYTES, OPEN_IN_EDITOR_PATH, handleInspectorRequest } from "./handle-request.js"
import type { InspectorServerOptions } from "./handle-request.js"
import { buildErrorResponse } from "./responses.js"
import type { InspectorResponse } from "./responses.js"

function requestPathname(url: string | undefined): string {
  if (url === undefined) return ""
  const queryIndex = url.indexOf("?")
  return queryIndex === -1 ? url : url.slice(0, queryIndex)
}

/**
 * Buffer the request body up to `maxBytes`. Once exceeded, stops retaining
 * further chunks (bounding memory) but keeps draining the stream so the
 * connection completes normally and the client observes the resulting
 * `BODY_TOO_LARGE` response instead of a reset connection.
 */
function readBody(req: IncomingMessage, maxBytes: number): Promise<{ ok: true; body: string } | { ok: false }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let received = 0
    let overLimit = false

    req.on("data", (chunk: Buffer) => {
      received += chunk.length
      if (received > maxBytes) {
        overLimit = true
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      resolve(overLimit ? { ok: false } : { ok: true, body: Buffer.concat(chunks).toString("utf8") })
    })
    req.on("error", reject)
  })
}

function writeResponse(res: ServerResponse, response: InspectorResponse): void {
  res.statusCode = response.status
  for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value)
  res.end(response.body)
}

/**
 * Connect-compatible middleware (§12.2) serving the open-in-editor endpoint;
 * every other request is passed through to `next`. Enforces the request
 * body size limit while streaming, before the framework-neutral handler
 * ever sees the body.
 */
export function createInspectorMiddleware(options: InspectorServerOptions): connect.NextHandleFunction {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES

  return (req, res, next) => {
    if (requestPathname(req.url) !== OPEN_IN_EDITOR_PATH) {
      next()
      return
    }

    if (req.method !== "POST") {
      writeResponse(res, buildErrorResponse("METHOD_NOT_ALLOWED", "Only POST is supported."))
      return
    }

    readBody(req, maxBodyBytes)
      .then((result) => {
        if (!result.ok) {
          writeResponse(
            res,
            buildErrorResponse("BODY_TOO_LARGE", "Request body exceeds the maximum allowed size."),
          )
          return undefined
        }
        const inspectorRequest = { method: req.method ?? "POST", headers: req.headers, body: result.body }
        return handleInspectorRequest(inspectorRequest, options).then((response) => {
          writeResponse(res, response)
        })
      })
      .catch(next)
  }
}
