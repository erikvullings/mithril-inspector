/** Upper bound for `line`/`column` (§10.2 "bounded integers"): generous for any real file, rejects absurd values. */
export const MAX_LINE_COLUMN = 10_000_000

export interface EditorRequestBody {
  readonly file: string
  readonly line: number
  readonly column: number
}

export type RequestBodyErrorCode = "INVALID_JSON" | "INVALID_PATH" | "INVALID_LINE_COLUMN"

export type ParsedRequestBody =
  | { readonly ok: true; readonly value: EditorRequestBody }
  | { readonly ok: false; readonly code: RequestBodyErrorCode; readonly message: string }

function isPositiveBoundedInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_LINE_COLUMN
}

/**
 * Parse and validate an open-in-editor request body (§10.1, §10.2): valid
 * JSON object, non-empty `file` string, `line`/`column` as positive bounded
 * integers. Distinguishes error codes per field so callers can report the
 * specific protocol error code.
 */
export function parseEditorRequestBody(raw: string): ParsedRequestBody {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, code: "INVALID_JSON", message: "Request body must be valid JSON." }
  }

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, code: "INVALID_JSON", message: "Request body must be a JSON object." }
  }

  const { file, line, column } = json as Record<string, unknown>

  if (typeof file !== "string" || file.length === 0) {
    return { ok: false, code: "INVALID_PATH", message: "file must be a non-empty string." }
  }

  if (!isPositiveBoundedInteger(line) || !isPositiveBoundedInteger(column)) {
    return { ok: false, code: "INVALID_LINE_COLUMN", message: "line and column must be positive integers." }
  }

  return { ok: true, value: { file, line, column } }
}
