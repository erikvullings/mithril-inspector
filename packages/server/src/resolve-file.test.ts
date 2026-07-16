import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { resolveRequestedFile } from "./resolve-file.js"

let root: string
let outside: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "mi-server-root-"))
  outside = mkdtempSync(path.join(tmpdir(), "mi-server-outside-"))
  mkdirSync(path.join(root, "src"), { recursive: true })
  writeFileSync(path.join(root, "src", "foo.ts"), "export const foo = 1\n")
  mkdirSync(path.join(root, "src", "dir"), { recursive: true })
  writeFileSync(path.join(outside, "secret.ts"), "export const secret = 1\n")
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

describe("resolveRequestedFile", () => {
  it("resolves a relative path inside the root", async () => {
    const result = await resolveRequestedFile("src/foo.ts", root, [])
    expect(result).toEqual({ ok: true, path: path.resolve(root, "src/foo.ts") })
  })

  it("resolves an absolute path inside the root", async () => {
    const absolute = path.join(root, "src", "foo.ts")
    const result = await resolveRequestedFile(absolute, root, [])
    expect(result).toEqual({ ok: true, path: absolute })
  })

  it("resolves a path inside an additional project root (monorepo)", async () => {
    const otherRoot = mkdtempSync(path.join(tmpdir(), "mi-server-other-root-"))
    try {
      writeFileSync(path.join(otherRoot, "bar.ts"), "export const bar = 1\n")
      const result = await resolveRequestedFile(path.join(otherRoot, "bar.ts"), root, [otherRoot])
      expect(result).toEqual({ ok: true, path: path.join(otherRoot, "bar.ts") })
    } finally {
      rmSync(otherRoot, { recursive: true, force: true })
    }
  })

  it("rejects relative path traversal escaping the root", async () => {
    const result = await resolveRequestedFile("../../etc/passwd", root, [])
    expect(result).toMatchObject({ ok: false, code: "FILE_OUTSIDE_ROOT" })
  })

  it("rejects an absolute path outside the root", async () => {
    const result = await resolveRequestedFile(path.join(outside, "secret.ts"), root, [])
    expect(result).toMatchObject({ ok: false, code: "FILE_OUTSIDE_ROOT" })
  })

  it("rejects a nonexistent file", async () => {
    const result = await resolveRequestedFile("src/does-not-exist.ts", root, [])
    expect(result).toMatchObject({ ok: false, code: "FILE_NOT_FOUND" })
  })

  it("rejects a directory", async () => {
    const result = await resolveRequestedFile("src/dir", root, [])
    expect(result).toMatchObject({ ok: false, code: "IS_DIRECTORY" })
  })

  it("rejects a symlink that escapes the root", async () => {
    const linkPath = path.join(root, "src", "escape.ts")
    symlinkSync(path.join(outside, "secret.ts"), linkPath)
    const result = await resolveRequestedFile("src/escape.ts", root, [])
    expect(result).toMatchObject({ ok: false, code: "FILE_OUTSIDE_ROOT" })
  })

  it("accepts a symlink that stays within the root", async () => {
    const linkPath = path.join(root, "src", "alias.ts")
    symlinkSync(path.join(root, "src", "foo.ts"), linkPath)
    const result = await resolveRequestedFile("src/alias.ts", root, [])
    expect(result).toEqual({ ok: true, path: linkPath })
  })

  it("rejects a file path containing a null byte", async () => {
    const poisoned = "src/foo.ts" + String.fromCharCode(0) + ".ts"
    const result = await resolveRequestedFile(poisoned, root, [])
    expect(result).toMatchObject({ ok: false, code: "INVALID_PATH" })
  })

  it("rejects a sibling directory that merely shares the root's name as a prefix", async () => {
    const siblingRoot = `${root}-sibling`
    mkdirSync(siblingRoot, { recursive: true })
    try {
      writeFileSync(path.join(siblingRoot, "sneaky.ts"), "export const sneaky = 1\n")
      const result = await resolveRequestedFile(path.join(siblingRoot, "sneaky.ts"), root, [])
      expect(result).toMatchObject({ ok: false, code: "FILE_OUTSIDE_ROOT" })
    } finally {
      rmSync(siblingRoot, { recursive: true, force: true })
    }
  })
})
