import { describe, expect, it } from "vitest"

import { DEFAULT_OVERLAY_OPTIONS, resolveOverlayOptions } from "./options.js"

describe("resolveOverlayOptions", () => {
  it("returns the documented defaults with no input", () => {
    const options = resolveOverlayOptions()
    expect(options.defaultOpen).toBe(false)
    expect(options.theme).toBe("system")
    expect(options.picker.toggleShortcut).toBe("Alt+Shift+M")
    expect(options.picker.holdShortcut).toBe("Alt")
    expect(options.picker.openShortcut).toBe("Enter")
    expect(options.picker.cancelShortcut).toBe("Escape")
    expect(options.picker.openOnClick).toBe(false)
    expect(options.picker.continuous).toBe(false)
  })

  it("gives pass-through and open-editor distinct default modifiers so neither shadows the other (§8.7)", () => {
    const options = resolveOverlayOptions()
    expect(options.picker.passThroughModifier).toBe("Alt+Shift")
    expect(options.picker.openEditorModifier).toBe("Meta")
    expect(options.picker.toggleShortcut).not.toMatch(/click/i)
  })

  it("merges a partial picker block without dropping sibling defaults", () => {
    const options = resolveOverlayOptions({ picker: { continuous: true } })
    expect(options.picker.continuous).toBe(true)
    expect(options.picker.toggleShortcut).toBe("Alt+Shift+M") // preserved
  })

  it("defaults componentTree to enabled with attrs/state capture on (§11.1, task 0022)", () => {
    const options = resolveOverlayOptions()
    expect(options.componentTree).toEqual({ enabled: true, captureAttrs: true, captureState: true })
  })

  it("merges a partial componentTree block without dropping sibling defaults", () => {
    const options = resolveOverlayOptions({ componentTree: { captureState: false } })
    expect(options.componentTree).toEqual({ enabled: true, captureAttrs: true, captureState: false })
  })

  it("lets the Vite adapter disable the tree entirely (its own resolver defaults componentTree.enabled to false)", () => {
    const options = resolveOverlayOptions({ componentTree: { enabled: false, captureAttrs: false, captureState: false } })
    expect(options.componentTree).toEqual({ enabled: false, captureAttrs: false, captureState: false })
  })

  it("overrides top-level fields and ignores explicit undefined", () => {
    const options = resolveOverlayOptions({ defaultOpen: true, theme: undefined })
    expect(options.defaultOpen).toBe(true)
    expect(options.theme).toBe("system")
  })

  it("does not mutate the shared defaults object", () => {
    resolveOverlayOptions({ defaultOpen: true, picker: { enabled: false } })
    expect(DEFAULT_OVERLAY_OPTIONS.defaultOpen).toBe(false)
    expect(DEFAULT_OVERLAY_OPTIONS.picker.enabled).toBe(true)
  })
})
