import { describe, expect, it, vi } from "vitest"

import { createEditorClient, OPEN_IN_EDITOR_PATH } from "./editor.js"

describe("createEditorClient", () => {
  it("POSTs file/line/column as JSON to the endpoint", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
    const open = createEditorClient(fetchImpl)
    const result = await open({ file: "src/UserCard.ts", line: 17, column: 5 })

    expect(result).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith(OPEN_IN_EDITOR_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "src/UserCard.ts", line: 17, column: 5 }),
    })
  })

  it("sends only file/line/column, never extra data (§15)", async () => {
    let sentBody = ""
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      sentBody = init.body
      return { ok: true, json: async () => ({ ok: true }) }
    })
    await createEditorClient(fetchImpl)({ file: "a.ts", line: 1, column: 1 })
    const body = JSON.parse(sentBody) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(["column", "file", "line"])
  })

  it("propagates a server error payload", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: { code: "FILE_OUTSIDE_ROOT", message: "nope" } }),
    }))
    const result = await createEditorClient(fetchImpl)({ file: "x", line: 1, column: 1 })
    expect(result).toEqual({ ok: false, error: { code: "FILE_OUTSIDE_ROOT", message: "nope" } })
  })

  it("resolves to a non-ok result when fetch rejects (no throw, §16)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down")
    })
    const result = await createEditorClient(fetchImpl)({ file: "x", line: 1, column: 1 })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("REQUEST_FAILED")
  })

  it("reports when fetch is unavailable", async () => {
    const result = await createEditorClient(null)({ file: "x", line: 1, column: 1 })
    expect(result).toEqual({ ok: false, error: { code: "NO_FETCH", message: "fetch is unavailable" } })
  })
})
