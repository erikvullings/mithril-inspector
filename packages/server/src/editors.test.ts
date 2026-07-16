import { describe, expect, it } from "vitest"

import { resolveEditor } from "./editors.js"

const LOCATION = { file: "/project/src/foo.ts", line: 17, column: 5 }

describe("resolveEditor", () => {
  it("resolves the code alias to a -g goto argument", () => {
    const editor = resolveEditor("code", {})
    expect(editor).not.toBeNull()
    expect(editor?.command).toBe("code")
    expect(editor?.args(LOCATION)).toEqual(["-g", "/project/src/foo.ts:17:5"])
  })

  it("resolves the code-insiders alias", () => {
    const editor = resolveEditor("code-insiders", {})
    expect(editor?.command).toBe("code-insiders")
    expect(editor?.args(LOCATION)).toEqual(["-g", "/project/src/foo.ts:17:5"])
  })

  it("resolves the cursor alias", () => {
    const editor = resolveEditor("cursor", {})
    expect(editor?.args(LOCATION)).toEqual(["-g", "/project/src/foo.ts:17:5"])
  })

  it("resolves the windsurf alias", () => {
    const editor = resolveEditor("windsurf", {})
    expect(editor?.args(LOCATION)).toEqual(["-g", "/project/src/foo.ts:17:5"])
  })

  it("resolves the webstorm alias to --line/--column flags", () => {
    const editor = resolveEditor("webstorm", {})
    expect(editor?.command).toBe("webstorm")
    expect(editor?.args(LOCATION)).toEqual(["--line", "17", "--column", "5", "/project/src/foo.ts"])
  })

  it("resolves the idea alias to --line/--column flags", () => {
    const editor = resolveEditor("idea", {})
    expect(editor?.args(LOCATION)).toEqual(["--line", "17", "--column", "5", "/project/src/foo.ts"])
  })

  it("resolves the subl alias to a combined file:line:column argument", () => {
    const editor = resolveEditor("subl", {})
    expect(editor?.args(LOCATION)).toEqual(["/project/src/foo.ts:17:5"])
  })

  it("resolves the vim alias to a cursor() command", () => {
    const editor = resolveEditor("vim", {})
    expect(editor?.args(LOCATION)).toEqual(["+call cursor(17, 5)", "/project/src/foo.ts"])
  })

  it("resolves the nvim alias to a cursor() command", () => {
    const editor = resolveEditor("nvim", {})
    expect(editor?.args(LOCATION)).toEqual(["+call cursor(17, 5)", "/project/src/foo.ts"])
  })

  it("uses a custom editor's own command and args function", () => {
    const args = (location: { file: string; line: number; column: number }) => [
      "--goto",
      `${location.file}:${location.line}:${location.column}`,
    ]
    const editor = resolveEditor({ command: "/custom/path/to/editor", args }, {})
    expect(editor?.command).toBe("/custom/path/to/editor")
    expect(editor?.args(LOCATION)).toEqual(["--goto", "/project/src/foo.ts:17:5"])
  })

  it("falls back to MITHRIL_INSPECTOR_EDITOR when no explicit editor option is set", () => {
    const editor = resolveEditor(undefined, { MITHRIL_INSPECTOR_EDITOR: "code" })
    expect(editor?.command).toBe("code")
    expect(editor?.args(LOCATION)).toEqual(["-g", "/project/src/foo.ts:17:5"])
  })

  it("prefers MITHRIL_INSPECTOR_EDITOR over LAUNCH_EDITOR, VISUAL and EDITOR", () => {
    const editor = resolveEditor(undefined, {
      MITHRIL_INSPECTOR_EDITOR: "webstorm",
      LAUNCH_EDITOR: "code",
      VISUAL: "vim",
      EDITOR: "subl",
    })
    expect(editor?.command).toBe("webstorm")
  })

  it("falls back to LAUNCH_EDITOR when MITHRIL_INSPECTOR_EDITOR is unset", () => {
    const editor = resolveEditor(undefined, { LAUNCH_EDITOR: "cursor", VISUAL: "vim", EDITOR: "subl" })
    expect(editor?.command).toBe("cursor")
  })

  it("falls back to VISUAL when MITHRIL_INSPECTOR_EDITOR and LAUNCH_EDITOR are unset", () => {
    const editor = resolveEditor(undefined, { VISUAL: "vim", EDITOR: "subl" })
    expect(editor?.command).toBe("vim")
  })

  it("falls back to EDITOR as a last resort", () => {
    const editor = resolveEditor(undefined, { EDITOR: "subl" })
    expect(editor?.command).toBe("subl")
  })

  it("prefers the explicit editor option over every environment variable", () => {
    const editor = resolveEditor("nvim", { MITHRIL_INSPECTOR_EDITOR: "code" })
    expect(editor?.command).toBe("nvim")
  })

  it("returns null when nothing is configured", () => {
    expect(resolveEditor(undefined, {})).toBeNull()
  })

  it("matches a known alias by basename when the env var is a full path", () => {
    const editor = resolveEditor(undefined, { EDITOR: "/usr/local/bin/code" })
    expect(editor?.command).toBe("/usr/local/bin/code")
    expect(editor?.args(LOCATION)).toEqual(["-g", "/project/src/foo.ts:17:5"])
  })

  it("matches a known alias by basename stripping a Windows .cmd extension", () => {
    const editor = resolveEditor(undefined, { EDITOR: "C:\\bin\\code.cmd" })
    expect(editor?.args(LOCATION)).toEqual(["-g", "/project/src/foo.ts:17:5"])
  })

  it("drops the line/column for an unrecognized editor and just opens the file", () => {
    const editor = resolveEditor(undefined, { EDITOR: "some-unknown-editor" })
    expect(editor?.command).toBe("some-unknown-editor")
    expect(editor?.args(LOCATION)).toEqual(["/project/src/foo.ts"])
  })

  it("ignores an empty environment variable value", () => {
    const editor = resolveEditor(undefined, { MITHRIL_INSPECTOR_EDITOR: "", EDITOR: "subl" })
    expect(editor?.command).toBe("subl")
  })
})
