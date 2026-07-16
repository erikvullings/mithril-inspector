import { describe, expect, it, vi } from "vitest"

import { createDiagnostics } from "./diagnostics.js"

describe("createDiagnostics", () => {
  it("guard returns the value on success and the fallback on throw (§16)", () => {
    const log = createDiagnostics()
    expect(log.guard("hover", () => 42, -1)).toBe(42)
    expect(log.count()).toBe(0)

    const result = log.guard(
      "hover",
      () => {
        throw new Error("boom")
      },
      -1,
    )
    expect(result).toBe(-1)
    expect(log.count()).toBe(1)
    expect(log.list()[0]).toMatchObject({ feature: "hover", message: "boom" })
  })

  it("records non-Error throwables with a readable message", () => {
    const log = createDiagnostics()
    log.record("x", "string failure")
    log.record("y", { toString: () => "objecty" })
    expect(log.list().map((d) => d.message)).toEqual(["string failure", "objecty"])
  })

  it("notifies subscribers on record and clear", () => {
    const log = createDiagnostics()
    const listener = vi.fn()
    const off = log.onChange(listener)
    log.record("a", new Error("1"))
    log.clear()
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    log.record("b", new Error("2"))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("caps retained entries at max (ring buffer)", () => {
    const log = createDiagnostics({ max: 3 })
    for (let i = 0; i < 5; i++) log.record("f", new Error(`e${i}`))
    expect(log.count()).toBe(3)
    expect(log.list().map((d) => d.message)).toEqual(["e2", "e3", "e4"])
  })

  it("stamps each diagnostic with the injected clock", () => {
    let t = 100
    const log = createDiagnostics({ now: () => t })
    log.record("a", new Error("1"))
    t = 250
    log.record("b", new Error("2"))
    expect(log.list().map((d) => d.time)).toEqual([100, 250])
  })
})
