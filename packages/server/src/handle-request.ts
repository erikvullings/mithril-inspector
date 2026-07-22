import type { EditorOption } from "./editors.js"
import { resolveEditor } from "./editors.js"
import { spawnEditorProcess } from "./launch-editor-process.js"
import type { EditorProcessLauncher } from "./launch-editor-process.js"
import type { PathMapping } from "./path-mappings.js"
import { applyPathMappings } from "./path-mappings.js"
import { parseEditorRequestBody } from "./request-body.js"
import { resolveRequestedFile } from "./resolve-file.js"
import { buildErrorResponse, buildSuccessResponse } from "./responses.js"
import type { InspectorResponse } from "./responses.js"

export type { InspectorErrorCode, InspectorResponse, TransportErrorCode } from "./responses.js"

/** Path the open-in-editor endpoint is served at (§10.1). */
export const OPEN_IN_EDITOR_PATH = "/__mithril-inspector/open-in-editor"

/** Default request body size limit: generous for a `{file, line, column}` payload, small enough to bound memory (§10.2). */
export const DEFAULT_MAX_BODY_BYTES = 16 * 1024

export interface InspectorServerOptions {
  /** The primary project root every requested file is validated against (§10.2). */
  readonly root: string
  /** Additional roots for monorepos (§10.4). */
  readonly projectRoots?: string[]
  /** Editor alias, custom command, or `undefined` to use the environment-variable fallback (§10.3). */
  readonly editor?: EditorOption
  /** Remote-environment path rewrites, applied after validation and before launch (§10.4). */
  readonly pathMappings?: PathMapping[]
  /** Maximum accepted request body size in bytes (default {@link DEFAULT_MAX_BODY_BYTES}). */
  readonly maxBodyBytes?: number
  /** Injectable editor process launcher, primarily for tests (defaults to {@link spawnEditorProcess}). */
  readonly launchEditorProcess?: EditorProcessLauncher
  /** Environment to read editor fallback variables from (defaults to `process.env`). */
  readonly env?: Readonly<Record<string, string | undefined>>
}

/** A framework-neutral HTTP request (§12.2): the body is already fully read. */
export interface InspectorRequest {
  readonly method: string
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  readonly body: string
}

function contentTypeIsJson(headers: InspectorRequest["headers"]): boolean {
  const raw = headers["content-type"]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== "string") return false
  return value.split(";")[0]?.trim().toLowerCase() === "application/json"
}

/**
 * Framework-neutral open-in-editor request handler (§12.2). Validates
 * method, content type, body size and JSON shape, resolves and validates the
 * requested file against the configured roots (§10.2), applies path
 * mappings (§10.4), then launches the configured editor (§10.3). Only
 * `file`, `line` and `column` are ever read from the request body (§15).
 */
export async function handleInspectorRequest(
  request: InspectorRequest,
  options: InspectorServerOptions,
): Promise<InspectorResponse> {
  if (request.method !== "POST") {
    return buildErrorResponse("METHOD_NOT_ALLOWED", "Only POST is supported.")
  }

  if (!contentTypeIsJson(request.headers)) {
    return buildErrorResponse("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.")
  }

  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  if (Buffer.byteLength(request.body, "utf8") > maxBodyBytes) {
    return buildErrorResponse("BODY_TOO_LARGE", "Request body exceeds the maximum allowed size.")
  }

  const parsedBody = parseEditorRequestBody(request.body)
  if (!parsedBody.ok) {
    return buildErrorResponse(parsedBody.code, parsedBody.message)
  }

  const resolvedFile = await resolveRequestedFile(
    parsedBody.value.file,
    options.root,
    options.projectRoots ?? [],
  )
  if (!resolvedFile.ok) {
    return buildErrorResponse(resolvedFile.code, resolvedFile.message)
  }

  const mappedPath = applyPathMappings(resolvedFile.path, options.pathMappings ?? [])

  const editor = resolveEditor(options.editor, options.env ?? process.env)

  const launch = options.launchEditorProcess ?? spawnEditorProcess
  try {
    await launch(
      editor.command,
      editor.args({ file: mappedPath, line: parsedBody.value.line, column: parsedBody.value.column }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "The editor process could not be started."
    // Always logged (not gated behind a debug flag): a silently failed editor
    // launch leaves the user clicking "open in editor" with no feedback at all.
    console.warn(
      `[mithril-inspector] Could not launch editor "${editor.command}": ${message} ` +
        `Set the "editor" plugin option, or the MITHRIL_INSPECTOR_EDITOR/LAUNCH_EDITOR/VISUAL/EDITOR ` +
        "environment variable, to a command available on your PATH.",
    )
    return buildErrorResponse("EDITOR_LAUNCH_FAILED", message)
  }

  return buildSuccessResponse()
}
