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

  it("round-trips showPickingBanner and ignores a non-boolean value", () => {
    const storage = memoryStorage()
    saveOverlayState({ showPickingBanner: false }, storage)
    expect(loadOverlayState(storage)).toEqual({ showPickingBanner: false })

    const bad = memoryStorage({ [OVERLAY_STORAGE_KEY]: JSON.stringify({ showPickingBanner: "no" }) })
    expect(loadOverlayState(bad)).toEqual({})
  })

  it("round-trips picker shortcut overrides (Settings tab live editing)", () => {
    const storage = memoryStorage()
    saveOverlayState(
      { pickerShortcuts: { holdShortcut: { value: "Ctrl", enabled: true }, passThroughModifier: { value: "", enabled: false } } },
      storage,
    )
    expect(loadOverlayState(storage)).toEqual({
      pickerShortcuts: { holdShortcut: { value: "Ctrl", enabled: true }, passThroughModifier: { value: "", enabled: false } },
    })
  })

  it("ignores an unknown picker-shortcut key and a malformed setting entry", () => {
    const storage = memoryStorage({
      [OVERLAY_STORAGE_KEY]: JSON.stringify({
        pickerShortcuts: {
          bogusKey: { value: "Alt", enabled: true },
          holdShortcut: { value: 42, enabled: true }, // wrong type for value
          openShortcut: { value: "Enter" }, // missing enabled
          cancelShortcut: { value: "Escape", enabled: true }, // valid
        },
      }),
    })
    expect(loadOverlayState(storage)).toEqual({
      pickerShortcuts: { cancelShortcut: { value: "Escape", enabled: true } },
    })
  })

  it("omits pickerShortcuts entirely when every entry was malformed", () => {
    const storage = memoryStorage({
      [OVERLAY_STORAGE_KEY]: JSON.stringify({ pickerShortcuts: { bogusKey: { value: "Alt", enabled: true } } }),
    })
    expect(loadOverlayState(storage)).toEqual({})
  })

  it("round-trips a theme override and ignores an unknown value", () => {
    const storage = memoryStorage()
    saveOverlayState({ theme: "dark" }, storage)
    expect(loadOverlayState(storage)).toEqual({ theme: "dark" })

    const bad = memoryStorage({ [OVERLAY_STORAGE_KEY]: JSON.stringify({ theme: "solarized" }) })
    expect(loadOverlayState(bad)).toEqual({})
  })

  it("round-trips extra redaction keys and drops blank/non-string entries", () => {
    const storage = memoryStorage()
    saveOverlayState({ extraRedactKeys: ["ssn", "creditCard"] }, storage)
    expect(loadOverlayState(storage)).toEqual({ extraRedactKeys: ["ssn", "creditCard"] })

    const dirty = memoryStorage({
      [OVERLAY_STORAGE_KEY]: JSON.stringify({ extraRedactKeys: ["ssn", "  ", 42, ""] }),
    })
    expect(loadOverlayState(dirty)).toEqual({ extraRedactKeys: ["ssn"] })

    const allBlank = memoryStorage({ [OVERLAY_STORAGE_KEY]: JSON.stringify({ extraRedactKeys: ["  "] }) })
    expect(loadOverlayState(allBlank)).toEqual({})
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
