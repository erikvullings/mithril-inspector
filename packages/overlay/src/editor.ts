import type { EditorRequest } from "@mithril-inspector/protocol"

/**
 * Client for the dev-server open-in-editor endpoint (§10.1). The endpoint
 * receives only `{ file, line, column }` — never component data (§15). The path
 * is a stable wire protocol shared with `@mithril-inspector/server`; it is
 * duplicated here rather than importing the Node-side server package into the
 * browser overlay.
 */
export const OPEN_IN_EDITOR_PATH = "/__mithril-inspector/open-in-editor"

export interface EditorOpenResult {
  ok: boolean
  error?: { code: string; message: string }
}

export type OpenInEditor = (request: EditorRequest) => Promise<EditorOpenResult>

type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>

function defaultFetch(): FetchLike | null {
  const candidate = (globalThis as { fetch?: unknown }).fetch
  return typeof candidate === "function" ? (candidate as FetchLike) : null
}

/**
 * Build an {@link OpenInEditor} that POSTs the request as JSON. Network and
 * parse failures resolve to a non-`ok` result rather than rejecting, so the
 * overlay can surface them in diagnostics without breaking the host (§16).
 */
export function createEditorClient(
  fetchImpl: FetchLike | null = defaultFetch(),
  path: string = OPEN_IN_EDITOR_PATH,
): OpenInEditor {
  return async (request) => {
    if (fetchImpl === null) {
      return { ok: false, error: { code: "NO_FETCH", message: "fetch is unavailable" } }
    }
    try {
      const response = await fetchImpl(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file: request.file, line: request.line, column: request.column }),
      })
      const payload = (await response.json()) as EditorOpenResult
      if (payload !== null && typeof payload === "object" && typeof payload.ok === "boolean") {
        return payload
      }
      return { ok: response.ok }
    } catch (error) {
      return {
        ok: false,
        error: { code: "REQUEST_FAILED", message: error instanceof Error ? error.message : "Request failed" },
      }
    }
  }
}
