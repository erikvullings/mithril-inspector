import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { handleInspectorRequest } from "./handle-request.js"
import type { InspectorRequest, InspectorServerOptions } from "./handle-request.js"

let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "mi-handle-request-"))
  mkdirSync(path.join(root, "src"), { recursive: true })
  writeFileSync(path.join(root, "src", "foo.ts"), "export const foo = 1\n")
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function jsonRequest(body: unknown, overrides: Partial<InspectorRequest> = {}): InspectorRequest {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...overrides,
  }
}

function baseOptions(overrides: Partial<InspectorServerOptions> = {}): InspectorServerOptions {
  return {
    root,
    editor: "code",
    launchEditorProcess: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function errorCodeOf(body: string): unknown {
  return (JSON.parse(body) as { error: { code: unknown } }).error.code
}

describe("handleInspectorRequest", () => {
  it("launches the configured editor and returns ok:true (mocked launcher)", async () => {
    const launch = vi.fn().mockResolvedValue(undefined)
    const response = await handleInspectorRequest(
      jsonRequest({ file: "src/foo.ts", line: 17, column: 5 }),
      baseOptions({ launchEditorProcess: launch }),
    )
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true })
    expect(launch).toHaveBeenCalledTimes(1)
    const [command, args] = launch.mock.calls[0] as [string, string[]]
    expect(command).toBe("code")
    expect(args).toEqual(["-g", `${path.join(root, "src", "foo.ts")}:17:5`])
  })

  it("rejects a non-POST method", async () => {
    const response = await handleInspectorRequest(
      jsonRequest({ file: "src/foo.ts", line: 1, column: 1 }, { method: "GET" }),
      baseOptions(),
    )
    expect(response.status).toBe(405)
    expect(errorCodeOf(response.body)).toBe("METHOD_NOT_ALLOWED")
  })

  it("rejects a non-JSON content type", async () => {
    const response = await handleInspectorRequest(
      jsonRequest(
        { file: "src/foo.ts", line: 1, column: 1 },
        { headers: { "content-type": "text/plain" } },
      ),
      baseOptions(),
    )
    expect(response.status).toBe(415)
    expect(errorCodeOf(response.body)).toBe("UNSUPPORTED_MEDIA_TYPE")
  })

  it("accepts a content type with a charset parameter", async () => {
    const response = await handleInspectorRequest(
      jsonRequest(
        { file: "src/foo.ts", line: 1, column: 1 },
        { headers: { "content-type": "application/json; charset=utf-8" } },
      ),
      baseOptions(),
    )
    expect(response.status).toBe(200)
  })

  it("rejects malformed JSON", async () => {
    const response = await handleInspectorRequest(
      { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" },
      baseOptions(),
    )
    expect(response.status).toBe(400)
    expect(errorCodeOf(response.body)).toBe("INVALID_JSON")
  })

  it("rejects an oversized body", async () => {
    const response = await handleInspectorRequest(
      jsonRequest({ file: "src/foo.ts", line: 1, column: 1, padding: "x".repeat(200) }),
      baseOptions({ maxBodyBytes: 32 }),
    )
    expect(response.status).toBe(413)
    expect(errorCodeOf(response.body)).toBe("BODY_TOO_LARGE")
  })

  it("rejects path traversal outside the root", async () => {
    const response = await handleInspectorRequest(
      jsonRequest({ file: "../../etc/passwd", line: 1, column: 1 }),
      baseOptions(),
    )
    expect(response.status).toBe(400)
    expect(errorCodeOf(response.body)).toBe("FILE_OUTSIDE_ROOT")
  })

  it("rejects an absolute path outside the root", async () => {
    const outside = mkdtempSync(path.join(tmpdir(), "mi-handle-request-outside-"))
    try {
      writeFileSync(path.join(outside, "secret.ts"), "export const secret = 1\n")
      const response = await handleInspectorRequest(
        jsonRequest({ file: path.join(outside, "secret.ts"), line: 1, column: 1 }),
        baseOptions(),
      )
      expect(response.status).toBe(400)
      expect(errorCodeOf(response.body)).toBe("FILE_OUTSIDE_ROOT")
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it("rejects a nonexistent file", async () => {
    const response = await handleInspectorRequest(
      jsonRequest({ file: "src/missing.ts", line: 1, column: 1 }),
      baseOptions(),
    )
    expect(response.status).toBe(404)
    expect(errorCodeOf(response.body)).toBe("FILE_NOT_FOUND")
  })

  it("rejects a directory", async () => {
    const response = await handleInspectorRequest(
      jsonRequest({ file: "src", line: 1, column: 1 }),
      baseOptions(),
    )
    expect(response.status).toBe(400)
    expect(errorCodeOf(response.body)).toBe("IS_DIRECTORY")
  })

  it("rejects an invalid line/column", async () => {
    const response = await handleInspectorRequest(
      jsonRequest({ file: "src/foo.ts", line: 0, column: 1 }),
      baseOptions(),
    )
    expect(response.status).toBe(400)
    expect(errorCodeOf(response.body)).toBe("INVALID_LINE_COLUMN")
  })

  it("falls back to VS Code when nothing is configured", async () => {
    const launch = vi.fn().mockResolvedValue(undefined)
    const response = await handleInspectorRequest(
      jsonRequest({ file: "src/foo.ts", line: 1, column: 1 }),
      { root, env: {}, launchEditorProcess: launch },
    )
    expect(response.status).toBe(200)
    expect(launch).toHaveBeenCalledWith("code", expect.anything())
  })

  it("reports EDITOR_LAUNCH_FAILED and warns to the console when the launcher rejects", async () => {
    const launch = vi.fn().mockRejectedValue(Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const response = await handleInspectorRequest(
      jsonRequest({ file: "src/foo.ts", line: 1, column: 1 }),
      baseOptions({ launchEditorProcess: launch }),
    )
    expect(response.status).toBe(500)
    expect(errorCodeOf(response.body)).toBe("EDITOR_LAUNCH_FAILED")
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain("code")
    expect(message).toContain("spawn ENOENT")
    warn.mockRestore()
  })

  it("applies path mappings to the launched path after validation, before invoking the editor", async () => {
    const launch = vi.fn().mockResolvedValue(undefined)
    const response = await handleInspectorRequest(
      jsonRequest({ file: "src/foo.ts", line: 3, column: 2 }),
      baseOptions({
        launchEditorProcess: launch,
        pathMappings: [{ from: root, to: "/mapped/project" }],
      }),
    )
    expect(response.status).toBe(200)
    const [, args] = launch.mock.calls[0] as [string, string[]]
    expect(args).toEqual(["-g", "/mapped/project/src/foo.ts:3:2"])
  })

  it("resolves a file inside an additional configured project root (monorepo)", async () => {
    const otherRoot = mkdtempSync(path.join(tmpdir(), "mi-handle-request-other-"))
    try {
      writeFileSync(path.join(otherRoot, "bar.ts"), "export const bar = 1\n")
      const launch = vi.fn().mockResolvedValue(undefined)
      const response = await handleInspectorRequest(
        jsonRequest({ file: path.join(otherRoot, "bar.ts"), line: 1, column: 1 }),
        baseOptions({ launchEditorProcess: launch, projectRoots: [otherRoot] }),
      )
      expect(response.status).toBe(200)
    } finally {
      rmSync(otherRoot, { recursive: true, force: true })
    }
  })

  it("falls back to an environment variable when no editor option is set", async () => {
    const launch = vi.fn().mockResolvedValue(undefined)
    const response = await handleInspectorRequest(
      jsonRequest({ file: "src/foo.ts", line: 1, column: 1 }),
      { root, launchEditorProcess: launch, env: { EDITOR: "subl" } },
    )
    expect(response.status).toBe(200)
    const [command] = launch.mock.calls[0] as [string, string[]]
    expect(command).toBe("subl")
  })

  it("ignores any fields beyond file/line/column in the request body (§15)", async () => {
    const launch = vi.fn().mockResolvedValue(undefined)
    const response = await handleInspectorRequest(
      jsonRequest({
        file: "src/foo.ts",
        line: 1,
        column: 1,
        attrs: { password: "hunter2" },
        componentId: "c:42",
      }),
      baseOptions({ launchEditorProcess: launch }),
    )
    expect(response.status).toBe(200)
    const [, args] = launch.mock.calls[0] as [string, string[]]
    expect(args.join(" ")).not.toContain("hunter2")
  })
})
