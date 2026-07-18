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
  it("round-trips collapsed through storage", () => {
    const storage = memoryStorage()
    saveOverlayState({ collapsed: true }, storage)
    expect(loadOverlayState(storage)).toEqual({ collapsed: true })
    expect(storage.data.has(OVERLAY_STORAGE_KEY)).toBe(true)
  })

  it("returns {} when nothing is stored", () => {
    expect(loadOverlayState(memoryStorage())).toEqual({})
  })

  it("ignores malformed JSON", () => {
    expect(loadOverlayState(memoryStorage({ [OVERLAY_STORAGE_KEY]: "{not json" }))).toEqual({})
  })

  it("ignores fields with the wrong type", () => {
    const storage = memoryStorage({
      [OVERLAY_STORAGE_KEY]: JSON.stringify({ collapsed: "yes" }),
    })
    expect(loadOverlayState(storage)).toEqual({})
  })

  it("round-trips activeTab and treeSearch (task 0022 follow-up: survive a Vite full-reload)", () => {
    const storage = memoryStorage()
    saveOverlayState({ activeTab: "components", treeSearch: "UserCard" }, storage)
    expect(loadOverlayState(storage)).toEqual({ activeTab: "components", treeSearch: "UserCard" })
  })

  it("ignores an unknown activeTab value and a non-string treeSearch", () => {
    const storage = memoryStorage({
      [OVERLAY_STORAGE_KEY]: JSON.stringify({ activeTab: "bogus", treeSearch: 42 }),
    })
    expect(loadOverlayState(storage)).toEqual({})
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
