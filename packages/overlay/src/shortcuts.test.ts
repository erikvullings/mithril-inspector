import { describe, expect, it } from "vitest"

import {
  isModifierHeld,
  matchesHold,
  matchesShortcut,
  parseShortcut,
} from "./shortcuts.js"

const key = (init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent =>
  ({
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...init,
  }) as KeyboardEvent

describe("parseShortcut", () => {
  it("parses a modifier chord with a key", () => {
    expect(parseShortcut("Alt+Shift+M")).toEqual({
      ctrl: false,
      alt: true,
      shift: true,
      meta: false,
      key: "m",
    })
  })

  it("parses a modifier-only hold (no key)", () => {
    expect(parseShortcut("Alt+Shift")).toEqual({
      ctrl: false,
      alt: true,
      shift: true,
      meta: false,
      key: null,
    })
  })

  it("accepts aliases (cmd/control/option) case-insensitively", () => {
    expect(parseShortcut("cmd+control+option+k")).toEqual({
      ctrl: true,
      alt: true,
      shift: false,
      meta: true,
      key: "k",
    })
  })

  it("normalizes named keys and is order-independent", () => {
    expect(parseShortcut("Escape")).toEqual({
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      key: "escape",
    })
    expect(parseShortcut("M+Alt+Shift")?.key).toBe("m")
  })

  it("treats disabled values as null (remappable/disable-able, §18)", () => {
    for (const value of ["", "  ", "none", "OFF", "disabled", null, undefined]) {
      expect(parseShortcut(value)).toBeNull()
    }
  })
})

describe("matchesShortcut", () => {
  it("matches only when every modifier and the key agree", () => {
    const spec = parseShortcut("Alt+Shift+M")
    // Shift produces an uppercase event.key — matching is case-insensitive.
    expect(matchesShortcut(key({ key: "M", altKey: true, shiftKey: true }), spec)).toBe(true)
    expect(matchesShortcut(key({ key: "m", altKey: true, shiftKey: true }), spec)).toBe(true)
  })

  it("rejects extra or missing modifiers", () => {
    const spec = parseShortcut("Alt+Shift+M")
    expect(matchesShortcut(key({ key: "M", altKey: true, shiftKey: true, ctrlKey: true }), spec)).toBe(false)
    expect(matchesShortcut(key({ key: "M", altKey: true }), spec)).toBe(false)
  })

  it("never matches a disabled or modifier-only spec", () => {
    expect(matchesShortcut(key({ key: "m" }), null)).toBe(false)
    expect(matchesShortcut(key({ key: "Alt", altKey: true, shiftKey: true }), parseShortcut("Alt+Shift"))).toBe(false)
  })
})

describe("matchesHold", () => {
  it("matches an exact modifier-only combination", () => {
    const spec = parseShortcut("Alt+Shift")
    expect(matchesHold({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false }, spec)).toBe(true)
  })

  it("breaks on extra or missing modifiers", () => {
    const spec = parseShortcut("Alt+Shift")
    expect(matchesHold({ altKey: true, shiftKey: true, ctrlKey: true, metaKey: false }, spec)).toBe(false)
    expect(matchesHold({ altKey: true, shiftKey: false, ctrlKey: false, metaKey: false }, spec)).toBe(false)
  })

  it("never matches a chord spec, a null spec, or an all-false state", () => {
    expect(matchesHold({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false }, parseShortcut("Alt+Shift+M"))).toBe(false)
    expect(matchesHold({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false }, null)).toBe(false)
  })
})

describe("isModifierHeld", () => {
  it("resolves a single modifier alias against the event", () => {
    const held = { altKey: false, shiftKey: false, ctrlKey: false, metaKey: true }
    expect(isModifierHeld(held, "Meta")).toBe(true)
    expect(isModifierHeld(held, "cmd")).toBe(true)
    expect(isModifierHeld(held, "Alt")).toBe(false)
  })

  it("returns false for disabled/unknown modifiers", () => {
    const held = { altKey: true, shiftKey: true, ctrlKey: true, metaKey: true }
    expect(isModifierHeld(held, "none")).toBe(false)
    expect(isModifierHeld(held, "")).toBe(false)
    expect(isModifierHeld(held, "banana")).toBe(false)
  })
})
