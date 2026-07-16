/** Editor CLIs recognized by name (§10.3). */
export type EditorAlias =
  | "code"
  | "code-insiders"
  | "cursor"
  | "windsurf"
  | "webstorm"
  | "idea"
  | "subl"
  | "vim"
  | "nvim"

export interface EditorLocation {
  readonly file: string
  readonly line: number
  readonly column: number
}

/** A user-supplied editor command outside the known aliases (§10.3). */
export interface CustomEditorOption {
  readonly command: string
  readonly args: (location: EditorLocation) => string[]
}

export type EditorOption = EditorAlias | CustomEditorOption

export interface ResolvedEditor {
  readonly command: string
  readonly args: (location: EditorLocation) => string[]
}

type ArgsBuilder = (location: EditorLocation) => string[]

const gotoArgs: ArgsBuilder = ({ file, line, column }) => ["-g", `${file}:${line}:${column}`]
const lineColumnFlagsArgs: ArgsBuilder = ({ file, line, column }) => [
  "--line",
  String(line),
  "--column",
  String(column),
  file,
]
const combinedPositionArgs: ArgsBuilder = ({ file, line, column }) => [`${file}:${line}:${column}`]
const vimCursorArgs: ArgsBuilder = ({ file, line, column }) => [`+call cursor(${line}, ${column})`, file]
/** No line/column mapping is known for this editor: opening the wrong location silently is worse than opening the file (§16). */
const fileOnlyArgs: ArgsBuilder = ({ file }) => [file]

const ALIAS_ARGS: Record<EditorAlias, ArgsBuilder> = {
  code: gotoArgs,
  "code-insiders": gotoArgs,
  cursor: gotoArgs,
  windsurf: gotoArgs,
  webstorm: lineColumnFlagsArgs,
  idea: lineColumnFlagsArgs,
  subl: combinedPositionArgs,
  vim: vimCursorArgs,
  nvim: vimCursorArgs,
}

/** Priority order for locating an editor when none is configured explicitly (§10.3). */
const ENV_VAR_NAMES = ["MITHRIL_INSPECTOR_EDITOR", "LAUNCH_EDITOR", "VISUAL", "EDITOR"] as const

function isEditorAlias(value: string): value is EditorAlias {
  return Object.hasOwn(ALIAS_ARGS, value)
}

/** Strip directories and a Windows executable extension, e.g. `C:\bin\code.cmd` -> `code`. */
function commandBasename(command: string): string {
  const base = command.split(/[\\/]/).pop() ?? command
  return base.replace(/\.(exe|cmd|bat)$/i, "")
}

function resolveCommandString(command: string): ResolvedEditor {
  const alias = commandBasename(command)
  return { command, args: isEditorAlias(alias) ? ALIAS_ARGS[alias] : fileOnlyArgs }
}

/**
 * Resolve which editor to launch (§10.3): the explicit `editor` option takes
 * priority; otherwise the first set environment variable in priority order
 * (`MITHRIL_INSPECTOR_EDITOR`, `LAUNCH_EDITOR`, `VISUAL`, `EDITOR`); `null`
 * when nothing is configured, so the caller can report `EDITOR_NOT_AVAILABLE`.
 */
export function resolveEditor(
  editorOption: EditorOption | undefined,
  env: Readonly<Record<string, string | undefined>>,
): ResolvedEditor | null {
  if (editorOption !== undefined) {
    return typeof editorOption === "string"
      ? resolveCommandString(editorOption)
      : { command: editorOption.command, args: editorOption.args }
  }

  for (const name of ENV_VAR_NAMES) {
    const value = env[name]
    if (value !== undefined && value.length > 0) return resolveCommandString(value)
  }

  return null
}
