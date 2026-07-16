import { describe, expect, it } from "vitest"

import { DEFAULT_OVERLAY_OPTIONS, resolveOverlayOptions } from "./options.js"

describe("resolveOverlayOptions", () => {
  it("returns the documented defaults with no input", () => {
    const options = resolveOverlayOptions()
    expect(options.position).toBe("bottom-right")
    expect(options.defaultOpen).toBe(false)
    expect(options.theme).toBe("system")
    expect(options.picker.toggleShortcut).toBe("Alt+Shift+M")
    expect(options.picker.holdShortcut).toBe("Alt+Shift")
    expect(options.picker.openShortcut).toBe("Enter")
    expect(options.picker.cancelShortcut).toBe("Escape")
    expect(options.picker.openOnClick).toBe(true)
    expect(options.picker.continuous).toBe(false)
  })

  it("does not bind plain Alt+Click by default (§8.4)", () => {
    const options = resolveOverlayOptions()
    // The pass-through modifier is Meta, distinct from the picker modifiers.
    expect(options.picker.passThroughModifier).toBe("Meta")
    expect(options.picker.toggleShortcut).not.toMatch(/click/i)
  })

  it("merges a partial picker block without dropping sibling defaults", () => {
    const options = resolveOverlayOptions({ picker: { continuous: true } })
    expect(options.picker.continuous).toBe(true)
    expect(options.picker.toggleShortcut).toBe("Alt+Shift+M") // preserved
  })

  it("overrides top-level fields and ignores explicit undefined", () => {
    const options = resolveOverlayOptions({ position: "top-left", theme: undefined })
    expect(options.position).toBe("top-left")
    expect(options.theme).toBe("system")
  })

  it("does not mutate the shared defaults object", () => {
    resolveOverlayOptions({ position: "top-right", picker: { enabled: false } })
    expect(DEFAULT_OVERLAY_OPTIONS.position).toBe("bottom-right")
    expect(DEFAULT_OVERLAY_OPTIONS.picker.enabled).toBe(true)
  })
})
