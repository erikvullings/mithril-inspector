import { describe, expect, it } from "vitest"

import { MAX_LINE_COLUMN, parseEditorRequestBody } from "./request-body.js"

describe("parseEditorRequestBody", () => {
  it("parses a valid body", () => {
    const result = parseEditorRequestBody(JSON.stringify({ file: "src/foo.ts", line: 17, column: 5 }))
    expect(result).toEqual({ ok: true, value: { file: "src/foo.ts", line: 17, column: 5 } })
  })

  it("rejects malformed JSON", () => {
    const result = parseEditorRequestBody("{not json")
    expect(result).toMatchObject({ ok: false, code: "INVALID_JSON" })
  })

  it("rejects a JSON body that is not an object", () => {
    const result = parseEditorRequestBody(JSON.stringify("just a string"))
    expect(result).toMatchObject({ ok: false, code: "INVALID_JSON" })
  })

  it("rejects a JSON array body", () => {
    const result = parseEditorRequestBody(JSON.stringify([1, 2, 3]))
    expect(result).toMatchObject({ ok: false, code: "INVALID_JSON" })
  })

  it("rejects a missing file field", () => {
    const result = parseEditorRequestBody(JSON.stringify({ line: 1, column: 1 }))
    expect(result).toMatchObject({ ok: false, code: "INVALID_PATH" })
  })

  it("rejects a non-string file field", () => {
    const result = parseEditorRequestBody(JSON.stringify({ file: 42, line: 1, column: 1 }))
    expect(result).toMatchObject({ ok: false, code: "INVALID_PATH" })
  })

  it("rejects an empty file string", () => {
    const result = parseEditorRequestBody(JSON.stringify({ file: "", line: 1, column: 1 }))
    expect(result).toMatchObject({ ok: false, code: "INVALID_PATH" })
  })

  it.each([0, -1, 1.5, NaN, Infinity, "5", null, undefined])(
    "rejects an invalid line value: %s",
    (line) => {
      const result = parseEditorRequestBody(JSON.stringify({ file: "src/foo.ts", line, column: 1 }))
      expect(result).toMatchObject({ ok: false, code: "INVALID_LINE_COLUMN" })
    },
  )

  it.each([0, -1, 1.5, NaN, Infinity, "5", null, undefined])(
    "rejects an invalid column value: %s",
    (column) => {
      const result = parseEditorRequestBody(JSON.stringify({ file: "src/foo.ts", line: 1, column }))
      expect(result).toMatchObject({ ok: false, code: "INVALID_LINE_COLUMN" })
    },
  )

  it("rejects a line value beyond the bound", () => {
    const result = parseEditorRequestBody(
      JSON.stringify({ file: "src/foo.ts", line: MAX_LINE_COLUMN + 1, column: 1 }),
    )
    expect(result).toMatchObject({ ok: false, code: "INVALID_LINE_COLUMN" })
  })

  it("accepts a line value at the bound", () => {
    const result = parseEditorRequestBody(
      JSON.stringify({ file: "src/foo.ts", line: MAX_LINE_COLUMN, column: 1 }),
    )
    expect(result.ok).toBe(true)
  })
})
