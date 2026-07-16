import { afterEach, describe, expect, it, vi } from "vitest"

import { createErrorBoundary } from "./errors.js"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("createErrorBoundary", () => {
  it("returns the function result when it does not throw", () => {
    const boundary = createErrorBoundary()
    expect(boundary.guard("source", () => 42, -1)).toBe(42)
  })

  it("returns the fallback and swallows the error when the function throws", () => {
    const boundary = createErrorBoundary()
    const result = boundary.guard(
      "source",
      () => {
        throw new Error("nope")
      },
      "fallback",
    )
    expect(result).toBe("fallback")
    expect(boundary.isEnabled("source")).toBe(true)
  })

  it("disables a feature after it reaches the failure threshold", () => {
    const boundary = createErrorBoundary({ threshold: 3 })
    const boom = () => {
      throw new Error("boom")
    }
    for (let i = 0; i < 3; i += 1) boundary.guard("source", boom, 0)
    expect(boundary.isEnabled("source")).toBe(false)

    // Once disabled, the guarded function is not even invoked.
    const fn = vi.fn(() => 1)
    expect(boundary.guard("source", fn, -1)).toBe(-1)
    expect(fn).not.toHaveBeenCalled()
  })

  it("tracks features independently", () => {
    const boundary = createErrorBoundary({ threshold: 1 })
    boundary.guard("source", () => {
      throw new Error("x")
    }, 0)
    expect(boundary.isEnabled("source")).toBe(false)
    expect(boundary.isEnabled("component")).toBe(true)
    expect(boundary.guard("component", () => 7, 0)).toBe(7)
  })

  it("invokes the onDisable callback once when a feature is disabled", () => {
    const onDisable = vi.fn()
    const boundary = createErrorBoundary({ threshold: 1, onDisable })
    boundary.guard("association", () => {
      throw new Error("x")
    }, undefined)
    boundary.guard("association", () => {
      throw new Error("x")
    }, undefined)
    expect(onDisable).toHaveBeenCalledTimes(1)
    expect(onDisable).toHaveBeenCalledWith("association")
  })

  it("logs a failure once per feature only in debug mode", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const quiet = createErrorBoundary({ debug: false })
    quiet.guard("source", () => {
      throw new Error("x")
    }, 0)
    expect(spy).not.toHaveBeenCalled()

    const loud = createErrorBoundary({ debug: true })
    loud.guard("source", () => {
      throw new Error("x")
    }, 0)
    loud.guard("source", () => {
      throw new Error("y")
    }, 0)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("re-enables and resets counters on reset", () => {
    const boundary = createErrorBoundary({ threshold: 1 })
    boundary.guard("source", () => {
      throw new Error("x")
    }, 0)
    expect(boundary.isEnabled("source")).toBe(false)
    boundary.reset()
    expect(boundary.isEnabled("source")).toBe(true)
  })
})
