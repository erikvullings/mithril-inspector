export const packageName = "@mithril-inspector/server" as const

export {
  DEFAULT_MAX_BODY_BYTES,
  OPEN_IN_EDITOR_PATH,
  handleInspectorRequest,
} from "./handle-request.js"
export type { InspectorErrorCode, InspectorRequest, InspectorResponse, InspectorServerOptions } from "./handle-request.js"

export { createInspectorMiddleware } from "./middleware.js"

export { isTerminalOnlyEditor, resolveEditor } from "./editors.js"
export type { CustomEditorOption, EditorAlias, EditorLocation, EditorOption, ResolvedEditor } from "./editors.js"

export { applyPathMappings } from "./path-mappings.js"
export type { PathMapping } from "./path-mappings.js"

export { resolveRequestedFile } from "./resolve-file.js"
export type { FileResolutionErrorCode, FileResolutionResult } from "./resolve-file.js"

export { MAX_LINE_COLUMN, parseEditorRequestBody } from "./request-body.js"
export type { EditorRequestBody, ParsedRequestBody, RequestBodyErrorCode } from "./request-body.js"

export { spawnEditorProcess } from "./launch-editor-process.js"
export type { EditorProcessLauncher } from "./launch-editor-process.js"

export { startInspectorServer } from "./start-server.js"
export type { InspectorServerHandle, StartInspectorServerOptions } from "./start-server.js"
