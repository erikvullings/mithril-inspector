import { describe, expect, it, vi } from "vitest"

import {
  loadOverlayState,
  OVERLAY_STORAGE_KEY,
  saveOverlayState,
  type StorageLike,
} from "./persistence.js"

function memoryStorage(seed?: Record<string, string>): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(seed ?? {}))
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v)
    },
  }
}

describe("overlay persistence", () => {
  it("round-trips collapsed + offset through storage", () => {
    const storage = memoryStorage()
    saveOverlayState({ collapsed: true, offset: { x: 12, y: -34 } }, storage)
    expect(loadOverlayState(storage)).toEqual({ collapsed: true, offset: { x: 12, y: -34 } })
    expect(storage.data.has(OVERLAY_STORAGE_KEY)).toBe(true)
  })

  it("returns {} when nothing is stored", () => {
    expect(loadOverlayState(memoryStorage())).toEqual({})
  })

  it("preserves an explicit null offset (unmoved)", () => {
    const storage = memoryStorage()
    saveOverlayState({ collapsed: false, offset: null }, storage)
    expect(loadOverlayState(storage)).toEqual({ collapsed: false, offset: null })
  })

  it("ignores malformed JSON", () => {
    expect(loadOverlayState(memoryStorage({ [OVERLAY_STORAGE_KEY]: "{not json" }))).toEqual({})
  })

  it("ignores fields with the wrong type and non-finite offsets", () => {
    const storage = memoryStorage({
      [OVERLAY_STORAGE_KEY]: JSON.stringify({ collapsed: "yes", offset: { x: "a", y: 3 } }),
    })
    expect(loadOverlayState(storage)).toEqual({})
    const nan = memoryStorage({
      [OVERLAY_STORAGE_KEY]: JSON.stringify({ offset: { x: Number.NaN, y: 3 } }),
    })
    expect(loadOverlayState(nan)).toEqual({})
  })

  it("degrades to {} and does not throw when storage access throws (§16)", () => {
    const throwing: StorageLike = {
      getItem: vi.fn(() => {
        throw new Error("SecurityError")
      }),
      setItem: vi.fn(() => {
        throw new Error("SecurityError")
      }),
    }
    expect(loadOverlayState(throwing)).toEqual({})
    expect(() => saveOverlayState({ collapsed: true }, throwing)).not.toThrow()
  })

  it("no-ops when there is no storage backend", () => {
    expect(loadOverlayState(null)).toEqual({})
    expect(() => saveOverlayState({ collapsed: true }, null)).not.toThrow()
  })
})
