import type { EditorErrorCode } from "@mithril-inspector/protocol"

/** Error codes beyond protocol's `EditorErrorCode` (0008): transport-level failures that never reach editor-open validation. */
export type TransportErrorCode = "METHOD_NOT_ALLOWED" | "UNSUPPORTED_MEDIA_TYPE" | "INVALID_JSON" | "BODY_TOO_LARGE"

export type InspectorErrorCode = EditorErrorCode | TransportErrorCode

export interface InspectorResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

const STATUS_BY_CODE: Record<InspectorErrorCode, number> = {
  METHOD_NOT_ALLOWED: 405,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INVALID_JSON: 400,
  BODY_TOO_LARGE: 413,
  INVALID_PATH: 400,
  INVALID_LINE_COLUMN: 400,
  FILE_OUTSIDE_ROOT: 400,
  FILE_NOT_FOUND: 404,
  IS_DIRECTORY: 400,
  EDITOR_NOT_AVAILABLE: 503,
  EDITOR_LAUNCH_FAILED: 500,
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" }

/** Build the `{ ok: false, error: { code, message } }` response (§10.1) with the status matching `code`. */
export function buildErrorResponse(code: InspectorErrorCode, message: string): InspectorResponse {
  return {
    status: STATUS_BY_CODE[code],
    headers: JSON_HEADERS,
    body: JSON.stringify({ ok: false, error: { code, message } }),
  }
}

/** Build the `{ ok: true }` success response (§10.1). */
export function buildSuccessResponse(): InspectorResponse {
  return { status: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) }
}
