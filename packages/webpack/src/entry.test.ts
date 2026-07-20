import { describe, expect, it } from "vitest"

import { resolveEntryNames } from "./entry.js"

describe("resolveEntryNames (§12.5 — plugin entry injection)", () => {
  it("resolves a single string entry to the default 'main' name", () => {
    expect(resolveEntryNames("./src/index.ts")).toEqual({ names: ["main"], dynamic: false })
  })

  it("resolves an array entry to the default 'main' name", () => {
    expect(resolveEntryNames(["./polyfills.ts", "./src/index.ts"])).toEqual({ names: ["main"], dynamic: false })
  })

  it("resolves an object entry to each of its keys", () => {
    expect(resolveEntryNames({ main: "./src/index.ts", admin: "./src/admin.ts" })).toEqual({
      names: ["main", "admin"],
      dynamic: false,
    })
  })

  it("resolves an object entry whose values are entry-description objects", () => {
    expect(resolveEntryNames({ main: { import: ["./src/index.ts"] } })).toEqual({
      names: ["main"],
      dynamic: false,
    })
  })

  it("flags a dynamic (function) entry as unsupported for auto-injection", () => {
    expect(resolveEntryNames(() => "./src/index.ts")).toEqual({ names: [], dynamic: true })
  })

  it("falls back to 'main' when entry is undefined", () => {
    expect(resolveEntryNames(undefined)).toEqual({ names: ["main"], dynamic: false })
  })
})
