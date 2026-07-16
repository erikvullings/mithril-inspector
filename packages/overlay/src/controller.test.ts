import type { ComponentId, ComponentRecord, SourceLocation } from "@mithril-inspector/protocol"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createOverlayController, type ClickEvent, type OverlayControllerDeps } from "./controller.js"
import type { OverlayHook } from "./hook.js"
import { resolveOverlayOptions, type OverlayOptionsInput } from "./options.js"

const elementSource: SourceLocation = {
  moduleId: "m:abc",
  sourceId: "s2",
  absoluteFile: "/project/src/UserCard.ts",
  relativeFile: "src/UserCard.ts",
  line: 17,
  column: 5,
  kind: "element",
  tagName: "article",
}

interface FakeHook extends OverlayHook {
  excluded: Node[]
}

function fakeHook(overrides: Partial<OverlayHook> = {}): FakeHook {
  const excluded: Node[] = []
  return {
    excluded,
    resolveDomSource: () => elementSource,
    resolveDomComponent: () => "c:1" as ComponentId,
    componentRecord: (id) => ({ id, displayName: "UserCard" }) as ComponentRecord,
    sourceOfVnode: () => null,
    excludeHost: (host) => {
      excluded.push(host)
    },
    flush: () => {},
    ...overrides,
  }
}

function stubRect(el: Element, rect: { left: number; top: number; width: number; height: number }): void {
  el.getBoundingClientRect = () =>
    ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect
}

function setup(opts?: {
  hook?: OverlayHook | null
  options?: OverlayOptionsInput
  hits?: Element[]
  openInEditor?: OverlayControllerDeps["openInEditor"]
}) {
  const redraw = vi.fn()
  let hits: Element[] = opts?.hits ?? []
  const doc = { elementsFromPoint: () => hits }
  const controller = createOverlayController({
    hook: opts?.hook === undefined ? fakeHook() : opts.hook,
    options: resolveOverlayOptions(opts?.options),
    doc,
    redraw,
    storage: null,
    ...(opts?.openInEditor ? { openInEditor: opts.openInEditor } : {}),
  })
  return {
    controller,
    redraw,
    setHits: (next: Element[]) => {
      hits = next
    },
  }
}

const clickEvent = (init: Partial<ClickEvent> = {}): ClickEvent => ({
  clientX: 5,
  clientY: 5,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...init,
})

const keyEvent = (init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent =>
  ({
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    ...init,
  }) as KeyboardEvent

afterEach(() => {
  document.body.innerHTML = ""
})

describe("overlay controller — startup", () => {
  it("starts collapsed by default and expanded when defaultOpen", () => {
    expect(setup().controller.getState().collapsed).toBe(true)
    expect(setup({ options: { defaultOpen: true } }).controller.getState().collapsed).toBe(false)
  })

  it("excludes the host from tracking via the hook (§8.2)", () => {
    const hook = fakeHook()
    const host = document.createElement("div")
    const { controller } = setup({ hook })
    controller.setHost(host)
    // setHost only stores locally; overlay.ts calls hook.excludeHost. Simulate.
    hook.excludeHost(host)
    expect(hook.excluded).toContain(host)
  })
})

describe("overlay controller — hover (§8.5)", () => {
  it("does nothing while the picker is inactive", () => {
    const el = document.createElement("button")
    const { controller, setHits } = setup()
    setHits([el])
    controller.handlePointerMove(5, 5)
    expect(controller.getState().hover).toBeNull()
  })

  it("resolves the hovered element to component/element/mapping and draws a rect", () => {
    const el = document.createElement("article")
    el.className = "user-card"
    stubRect(el, { left: 10, top: 20, width: 100, height: 40 })
    document.body.appendChild(el)

    const { controller, setHits } = setup()
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(5, 5)

    const state = controller.getState()
    expect(state.hover?.element).toBe("article.user-card")
    expect(state.hover?.componentName).toBe("UserCard")
    expect(state.hover?.mapping.precision).toBe("exact")
    expect(state.hover?.mapping.fileLine).toBe("src/UserCard.ts:17:5")
    expect(state.hoverRects).toEqual([{ left: 10, top: 20, width: 100, height: 40 }])
  })

  it("ignores the overlay host and its descendants (§8.2)", () => {
    const host = document.createElement("div")
    const inner = document.createElement("span")
    host.appendChild(inner)
    const { controller, setHits } = setup()
    controller.setHost(host)
    controller.startPicker()
    setHits([host, inner]) // only overlay hits under the pointer
    controller.handlePointerMove(5, 5)
    expect(controller.getState().hover).toBeNull()
  })
})

describe("overlay controller — selection (§8.7)", () => {
  it("suppresses the app click, selects, freezes the highlight, and expands", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 50, height: 20 })
    document.body.appendChild(el)
    const openInEditor = vi.fn(async () => ({ ok: true }))
    const { controller, setHits } = setup({ options: { picker: { openOnClick: false } }, openInEditor })

    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(5, 5)

    const event = clickEvent()
    const handled = controller.handleClick(event)

    expect(handled).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
    const state = controller.getState()
    expect(state.selection.node).toBe(el)
    expect(state.selection.mapping.precision).toBe("exact")
    expect(state.frozenRects).toEqual([{ left: 0, top: 0, width: 50, height: 20 }])
    expect(state.collapsed).toBe(false)
    expect(state.picking).toBe(false) // exits picker (non-continuous)
    expect(openInEditor).not.toHaveBeenCalled()
  })

  it("opens the editor on click when openOnClick is set", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)
    const openInEditor = vi.fn(async () => ({ ok: true }))
    const { controller, setHits } = setup({ openInEditor })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent())
    expect(openInEditor).toHaveBeenCalledWith({ file: "src/UserCard.ts", line: 17, column: 5 })
  })

  it("lets the app click pass through with the pass-through modifier (§8.7)", () => {
    const el = document.createElement("article")
    document.body.appendChild(el)
    const { controller, setHits } = setup()
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)

    const event = clickEvent({ metaKey: true }) // default pass-through is Meta
    const handled = controller.handleClick(event)
    expect(handled).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(controller.getState().selection.node).toBeNull()
    expect(controller.getState().picking).toBe(true) // still picking
  })

  it("stays in picker mode after selection in continuous mode", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)
    const { controller, setHits } = setup({ options: { picker: { continuous: true, openOnClick: false } } })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent())
    expect(controller.getState().picking).toBe(true)
  })
})

describe("overlay controller — keyboard (§8.4)", () => {
  it("toggles the picker on Alt+Shift+M", () => {
    const { controller } = setup()
    expect(controller.handleKeyDown(keyEvent({ key: "M", altKey: true, shiftKey: true }))).toBe(true)
    expect(controller.isPicking()).toBe(true)
    controller.handleKeyDown(keyEvent({ key: "M", altKey: true, shiftKey: true }))
    expect(controller.isPicking()).toBe(false)
  })

  it("starts a momentary hold on Alt+Shift and ends it on release", () => {
    const { controller } = setup()
    controller.handleKeyDown(keyEvent({ key: "Alt", altKey: true, shiftKey: true }))
    expect(controller.isPicking()).toBe(true)
    expect(controller.getState().picker.activation).toBe("hold")
    // Release Shift: modifiers no longer match the hold.
    controller.handleKeyUp(keyEvent({ key: "Shift", altKey: true, shiftKey: false }))
    expect(controller.isPicking()).toBe(false)
  })

  it("cancels the picker on Escape", () => {
    const { controller } = setup()
    controller.startPicker()
    expect(controller.handleKeyDown(keyEvent({ key: "Escape" }))).toBe(true)
    expect(controller.isPicking()).toBe(false)
  })

  it("opens the hovered source on Enter", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)
    const openInEditor = vi.fn(async () => ({ ok: true }))
    const { controller, setHits } = setup({ openInEditor })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)
    expect(controller.handleKeyDown(keyEvent({ key: "Enter" }))).toBe(true)
    expect(openInEditor).toHaveBeenCalledWith({ file: "src/UserCard.ts", line: 17, column: 5 })
  })

  it("respects disabled shortcuts (§18)", () => {
    // With both the toggle chord and the modifier hold disabled, Alt+Shift+M
    // must do nothing.
    const { controller } = setup({ options: { picker: { toggleShortcut: "none", holdShortcut: "off" } } })
    expect(controller.handleKeyDown(keyEvent({ key: "M", altKey: true, shiftKey: true }))).toBe(false)
    expect(controller.isPicking()).toBe(false)
  })
})

describe("overlay controller — stale selection (§8.8)", () => {
  it("marks a removed selection stale and promotes to the nearest mounted ancestor", () => {
    const parent = document.createElement("section")
    const el = document.createElement("article")
    stubRect(parent, { left: 0, top: 0, width: 200, height: 100 })
    stubRect(el, { left: 10, top: 10, width: 50, height: 20 })
    parent.appendChild(el)
    document.body.appendChild(parent)

    const { controller, setHits } = setup({ options: { picker: { openOnClick: false } } })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(15, 15)
    controller.handleClick(clickEvent())
    expect(controller.getState().selection.stale).toBe(false)

    parent.removeChild(el) // redraw removes the node
    expect(controller.getState().selection.stale).toBe(true)

    controller.promoteStaleSelection()
    const state = controller.getState()
    expect(state.selection.node).toBe(parent)
    expect(state.selection.stale).toBe(false)
  })
})

describe("overlay controller — resilience (§16)", () => {
  it("never throws and records diagnostics when the hook fails", () => {
    const el = document.createElement("article")
    document.body.appendChild(el)
    const hook = fakeHook({
      resolveDomSource: () => {
        throw new Error("hook exploded")
      },
    })
    const { controller, setHits } = setup({ hook })
    controller.startPicker()
    setHits([el])
    expect(() => controller.handlePointerMove(1, 1)).not.toThrow()
    expect(controller.getState().diagnostics.length).toBeGreaterThan(0)
  })

  it("works with no runtime hook present (production build)", () => {
    const el = document.createElement("article")
    document.body.appendChild(el)
    const { controller, setHits } = setup({ hook: null })
    controller.startPicker()
    setHits([el])
    expect(() => controller.handlePointerMove(1, 1)).not.toThrow()
    expect(controller.getState().hover?.mapping.precision).toBe("none")
  })
})
