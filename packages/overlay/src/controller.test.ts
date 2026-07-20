import type {
  ComponentId,
  ComponentRecord,
  InspectorSnapshot,
  PreviewNode,
  RuntimeEvent,
  SourceLocation,
} from "@mithril-inspector/protocol"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createOverlayController, type ClickEvent, type OverlayControllerDeps } from "./controller.js"
import type { OverlayHook } from "./hook.js"
import { resolveOverlayOptions, type OverlayOptionsInput } from "./options.js"
import type { DomMutationLike } from "./redraw-flash.js"

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

function memoryStorage(): NonNullable<OverlayControllerDeps["storage"]> {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
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
    componentAncestry: () => [],
    componentViewSource: () => null,
    sourceOfVnode: () => null,
    excludeHost: (host) => {
      excluded.push(host)
    },
    flush: () => {},
    getSnapshot: () => ({ components: new Map(), vnodes: new Map(), modules: new Map(), domAssociations: new Map() }),
    subscribe: () => () => {},
    getMode: () => "source",
    getRedactionEnabled: () => true,
    setRedactionEnabled: () => {},
    getRedactionKeys: () => [],
    addRedactionKey: () => {},
    attrsPreview: () => null,
    statePreview: () => null,
    expandPreview: () => null,
    ...overrides,
  }
}

function componentRecord(overrides: Partial<ComponentRecord> & { id: ComponentId }): ComponentRecord {
  return {
    parentId: null,
    displayName: "Comp",
    displayNameInferred: false,
    source: null,
    kind: "object",
    key: null,
    attrs: null,
    state: null,
    mounted: true,
    createdAt: 0,
    updatedAt: 0,
    updateCount: 0,
    renderDuration: null,
    slowRenderCount: 0,
    domRange: null,
    childIds: [],
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
  storage?: OverlayControllerDeps["storage"]
}) {
  const redraw = vi.fn()
  let hits: Element[] = opts?.hits ?? []
  const doc = { elementsFromPoint: () => hits }
  const controller = createOverlayController({
    hook: opts?.hook === undefined ? fakeHook() : opts.hook,
    options: resolveOverlayOptions(opts?.options),
    doc,
    redraw,
    storage: opts?.storage === undefined ? null : opts.storage,
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
    expect(state.hover?.componentName).toEqual({ name: "UserCard", inferred: false })
    expect(state.hover?.mapping.precision).toBe("exact")
    expect(state.hover?.mapping.fileLine).toBe("src/UserCard.ts:17:5")
    expect(state.hoverRects).toEqual([{ left: 10, top: 20, width: 100, height: 40 }])
  })

  it("marks a filename-derived/Anonymous component name as inferred (§2.4, task 0018)", () => {
    const el = document.createElement("article")
    el.className = "user-card"
    stubRect(el, { left: 10, top: 20, width: 100, height: 40 })
    document.body.appendChild(el)

    const hook = fakeHook({
      componentRecord: (id) => ({ id, displayName: "UserCard", displayNameInferred: true }) as ComponentRecord,
    })
    const { controller, setHits } = setup({ hook })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(5, 5)

    expect(controller.getState().hover?.componentName).toEqual({ name: "UserCard", inferred: true })
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

  it("does not open the editor on click by default — a pick lands in the panel, not the editor", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)
    const openInEditor = vi.fn(async () => ({ ok: true }))
    const { controller, setHits } = setup({ openInEditor })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent())
    expect(openInEditor).not.toHaveBeenCalled()
    expect(controller.getState().selection.node).toBe(el)
  })

  it("opens the editor on click when openOnClick is explicitly enabled", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)
    const openInEditor = vi.fn(async () => ({ ok: true }))
    const { controller, setHits } = setup({ options: { picker: { openOnClick: true } }, openInEditor })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent())
    expect(openInEditor).toHaveBeenCalledWith({ file: "src/UserCard.ts", line: 17, column: 5 })
  })

  it("opens the editor on a Meta (Cmd/Win)+Click even when openOnClick is off", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)
    const openInEditor = vi.fn(async () => ({ ok: true }))
    const { controller, setHits } = setup({ options: { picker: { openOnClick: false } }, openInEditor })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent({ metaKey: true }))
    expect(openInEditor).toHaveBeenCalledWith({ file: "src/UserCard.ts", line: 17, column: 5 })
    expect(controller.getState().selection.node).toBe(el)
  })

  it("does not use Ctrl+Click to open the editor — macOS intercepts it as a secondary click before it ever reaches a page", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)
    const openInEditor = vi.fn(async () => ({ ok: true }))
    const { controller, setHits } = setup({ options: { picker: { openOnClick: false } }, openInEditor })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent({ ctrlKey: true }))
    expect(openInEditor).not.toHaveBeenCalled()
    expect(controller.getState().selection.node).toBe(el) // still selects, just doesn't auto-open
  })

  it("openEditorModifier is checked ahead of passThroughModifier when both are configured to the same key", () => {
    const el = document.createElement("article")
    document.body.appendChild(el)
    const { controller, setHits } = setup({ options: { picker: { passThroughModifier: "Meta" } } })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)

    const event = clickEvent({ metaKey: true })
    const handled = controller.handleClick(event)
    expect(handled).toBe(true) // opening wins, rather than passing the click through
    expect(controller.getState().selection.node).toBe(el)
  })

  it("lets the app click pass through with the default pass-through modifier, Alt+Shift (§8.7)", () => {
    const el = document.createElement("article")
    document.body.appendChild(el)
    const { controller, setHits } = setup()
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)

    const event = clickEvent({ altKey: true, shiftKey: true })
    const handled = controller.handleClick(event)
    expect(handled).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(controller.getState().selection.node).toBeNull()
    expect(controller.getState().picking).toBe(true) // still picking
  })

  it("does not pass through on just Alt, or just Shift — the default requires the full Alt+Shift combo", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)
    const { controller, setHits } = setup()
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent({ altKey: true }))
    expect(controller.getState().selection.node).toBe(el) // selected, not passed through
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

  it("actually pressing the toggle chord key-by-key (default hold: Alt) still ends up picking, sticky — the hold shortcut's own modifier prefix must not swallow the chord", () => {
    // A real keyboard fires one keydown per physical key, in order — Alt,
    // then Shift, then M — not one synthetic event with every modifier
    // already set (that shape hid this exact bug: the default hold
    // shortcut, "Alt", is a prefix of the toggle chord's own modifiers, so
    // the Alt keydown alone starts a hold *before* Shift/M are pressed).
    const { controller } = setup()
    controller.handleKeyDown(keyEvent({ key: "Alt", altKey: true }))
    expect(controller.isPicking()).toBe(true) // hold started by "Alt" alone
    controller.handleKeyDown(keyEvent({ key: "Shift", altKey: true, shiftKey: true }))
    controller.handleKeyDown(keyEvent({ key: "M", altKey: true, shiftKey: true }))
    expect(controller.isPicking()).toBe(true) // promoted to sticky, not cancelled
    expect(controller.getState().picker.activation).toBe("toggle")

    // Releasing Alt (the hold's own modifier) afterward must not end the now-sticky session.
    controller.handleKeyUp(keyEvent({ key: "Alt", altKey: false, shiftKey: true }))
    expect(controller.isPicking()).toBe(true)
  })

  it("starts a momentary hold on Alt and ends it on release", () => {
    const { controller } = setup()
    controller.handleKeyDown(keyEvent({ key: "Alt", altKey: true }))
    expect(controller.isPicking()).toBe(true)
    expect(controller.getState().picker.activation).toBe("hold")
    controller.handleKeyUp(keyEvent({ key: "Alt", altKey: false }))
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

describe("overlay controller — Settings tab: live picker shortcut editing", () => {
  it("getState().pickerShortcuts seeds from the app-configured options, enabled by default", () => {
    const { controller } = setup()
    const shortcuts = controller.getState().pickerShortcuts
    expect(shortcuts.holdShortcut).toEqual({ value: "Alt", enabled: true })
    expect(shortcuts.passThroughModifier).toEqual({ value: "Alt+Shift", enabled: true })
  })

  it("setPickerShortcutValue rebinds a shortcut and it takes effect immediately, without reconstructing the controller", () => {
    const { controller } = setup()
    // Default hold is Alt; rebind it to Ctrl.
    controller.setPickerShortcutValue("holdShortcut", "Ctrl")
    expect(controller.getState().pickerShortcuts.holdShortcut).toEqual({ value: "Ctrl", enabled: true })

    expect(controller.handleKeyDown(keyEvent({ key: "Alt", altKey: true }))).toBe(false)
    expect(controller.isPicking()).toBe(false)
    expect(controller.handleKeyDown(keyEvent({ key: "Control", ctrlKey: true }))).toBe(true)
    expect(controller.isPicking()).toBe(true)
  })

  it("setPickerShortcutEnabled disables a shortcut without discarding its value, and re-enabling restores it", () => {
    const { controller } = setup()
    controller.setPickerShortcutEnabled("holdShortcut", false)
    expect(controller.getState().pickerShortcuts.holdShortcut).toEqual({ value: "Alt", enabled: false })
    expect(controller.handleKeyDown(keyEvent({ key: "Alt", altKey: true }))).toBe(false)
    expect(controller.isPicking()).toBe(false)

    controller.setPickerShortcutEnabled("holdShortcut", true)
    expect(controller.getState().pickerShortcuts.holdShortcut).toEqual({ value: "Alt", enabled: true })
    expect(controller.handleKeyDown(keyEvent({ key: "Alt", altKey: true }))).toBe(true)
    expect(controller.isPicking()).toBe(true)
  })

  it("resetPickerShortcut reverts to the app-configured value, discarding a Settings-tab override", () => {
    const { controller } = setup({ options: { picker: { holdShortcut: "Ctrl+Shift" } } })
    controller.setPickerShortcutValue("holdShortcut", "Alt")
    controller.setPickerShortcutEnabled("holdShortcut", false)
    controller.resetPickerShortcut("holdShortcut")
    expect(controller.getState().pickerShortcuts.holdShortcut).toEqual({ value: "Ctrl+Shift", enabled: true })
  })

  it("persists shortcut overrides and restores them for a fresh controller (e.g. after a Vite full-reload)", () => {
    const storage = memoryStorage()
    const first = setup({ storage })
    first.controller.setPickerShortcutValue("passThroughModifier", "Ctrl")
    first.controller.setPickerShortcutEnabled("openEditorModifier", false)

    const second = setup({ storage })
    expect(second.controller.getState().pickerShortcuts.passThroughModifier).toEqual({ value: "Ctrl", enabled: true })
    expect(second.controller.getState().pickerShortcuts.openEditorModifier.enabled).toBe(false)
  })
})

describe("overlay controller — Settings tab: live theme override (§8.1)", () => {
  it("getState().theme seeds from the app-configured options.theme", () => {
    const { controller } = setup({ options: { theme: "dark" } })
    expect(controller.getState().theme).toBe("dark")
  })

  it("setTheme overrides the effective theme immediately, without touching options.theme", () => {
    const { controller } = setup({ options: { theme: "system" } })
    controller.setTheme("light")
    expect(controller.getState().theme).toBe("light")
    expect(controller.options.theme).toBe("system")
  })

  it("resetTheme reverts to the app-configured options.theme, discarding a Settings-tab override", () => {
    const { controller } = setup({ options: { theme: "dark" } })
    controller.setTheme("light")
    controller.resetTheme()
    expect(controller.getState().theme).toBe("dark")
  })

  it("persists a theme override and restores it for a fresh controller (e.g. after a Vite full-reload)", () => {
    const storage = memoryStorage()
    const first = setup({ storage, options: { theme: "system" } })
    first.controller.setTheme("dark")

    const second = setup({ storage, options: { theme: "system" } })
    expect(second.controller.getState().theme).toBe("dark")
  })
})

describe("overlay controller — Settings tab: live redaction toggle (§15)", () => {
  it("getState().redactionEnabled reads live from the runtime hook, defaulting to true with no hook", () => {
    const { controller: withHook } = setup({ hook: fakeHook({ getRedactionEnabled: () => false }) })
    expect(withHook.getState().redactionEnabled).toBe(false)

    const { controller: withoutHook } = setup({ hook: null })
    expect(withoutHook.getState().redactionEnabled).toBe(true)
  })

  it("setRedactionEnabled forwards to the runtime hook and triggers a redraw", () => {
    const setRedactionEnabled = vi.fn()
    const { controller, redraw } = setup({ hook: fakeHook({ setRedactionEnabled }) })
    controller.setRedactionEnabled(false)
    expect(setRedactionEnabled).toHaveBeenCalledWith(false)
    expect(redraw).toHaveBeenCalled()
  })

  it("getState().redactionKeys reads live from the runtime hook", () => {
    const { controller } = setup({ hook: fakeHook({ getRedactionKeys: () => ["password", "ssn"] }) })
    expect(controller.getState().redactionKeys).toEqual(["password", "ssn"])
  })

  it("addRedactionKey trims, forwards to the hook, and ignores a blank pattern", () => {
    const addRedactionKey = vi.fn()
    const { controller, redraw } = setup({ hook: fakeHook({ addRedactionKey }) })

    controller.addRedactionKey("  ssn  ")
    expect(addRedactionKey).toHaveBeenCalledWith("ssn")
    expect(redraw).toHaveBeenCalled()

    addRedactionKey.mockClear()
    redraw.mockClear()
    controller.addRedactionKey("   ")
    expect(addRedactionKey).not.toHaveBeenCalled()
    expect(redraw).not.toHaveBeenCalled()
  })

  it("persists added keys and replays them onto a fresh controller's hook (e.g. after a Vite full-reload)", () => {
    const storage = memoryStorage()
    const first = setup({ storage })
    first.controller.addRedactionKey("ssn")

    const addRedactionKey = vi.fn()
    setup({ storage, hook: fakeHook({ addRedactionKey }) })
    expect(addRedactionKey).toHaveBeenCalledWith("ssn")
  })
})

describe("overlay controller — picking banner (§18)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows the banner immediately once picking starts, and auto-hides it a few seconds later while picking continues", () => {
    vi.useFakeTimers()
    const { controller } = setup()
    controller.startPicker()
    expect(controller.getState().pickingBannerVisible).toBe(true)

    vi.advanceTimersByTime(4000)
    expect(controller.getState().pickingBannerVisible).toBe(false)
    expect(controller.isPicking()).toBe(true) // still picking — only the banner hid
  })

  it("re-arms the auto-hide timer for a fresh picking session", () => {
    vi.useFakeTimers()
    const { controller } = setup()
    controller.startPicker()
    vi.advanceTimersByTime(4000)
    expect(controller.getState().pickingBannerVisible).toBe(false)

    controller.stopPicker()
    controller.startPicker()
    expect(controller.getState().pickingBannerVisible).toBe(true)
  })

  it("setShowPickingBanner(false) hides it immediately and persists across a fresh controller", () => {
    const storage = memoryStorage()
    const first = setup({ storage })
    first.controller.startPicker()
    expect(first.controller.getState().pickingBannerVisible).toBe(true)

    first.controller.setShowPickingBanner(false)
    expect(first.controller.getState().pickingBannerVisible).toBe(false)
    expect(first.controller.getState().showPickingBanner).toBe(false)

    const second = setup({ storage })
    expect(second.controller.getState().showPickingBanner).toBe(false)
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

describe("overlay controller — ancestry panel & reveal component (§9.1, §9.3, task 0019)", () => {
  it("is empty when nothing is selected", () => {
    const { controller } = setup()
    expect(controller.getState().ancestry).toEqual([])
    expect(controller.getState().selectedComponentChoices).toEqual([])
    expect(controller.getState().focusedAncestorId).toBeNull()
  })

  it("derives the ancestry list from the selection's owning component, root-first with resolved names (§9.1)", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)

    const appRecord = componentRecord({ id: "c:1" as ComponentId, displayName: "App" })
    const userCardRecord = componentRecord({
      id: "c:2" as ComponentId,
      displayName: "UserCard",
      displayNameInferred: true,
      mounted: false,
    })
    const hook = fakeHook({
      resolveDomComponent: () => "c:2" as ComponentId,
      componentRecord: (id) => (id === "c:2" ? userCardRecord : appRecord),
      componentAncestry: () => [appRecord, userCardRecord],
    })
    const { controller, setHits } = setup({ hook, options: { picker: { openOnClick: false } } })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent())

    const { ancestry } = controller.getState()
    expect(ancestry.map((a) => ({ id: a.id, name: a.name, mounted: a.mounted }))).toEqual([
      { id: "c:1", name: { name: "App", inferred: false }, mounted: true },
      { id: "c:2", name: { name: "UserCard", inferred: true }, mounted: false },
    ])
  })

  it("carries each record's renderDuration/slowRenderCount through to its ancestry entry (§17 diagnostics, task 0029)", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)

    const appRecord = componentRecord({ id: "c:1" as ComponentId, displayName: "App", renderDuration: 2.5, slowRenderCount: 0 })
    const userCardRecord = componentRecord({
      id: "c:2" as ComponentId,
      displayName: "UserCard",
      renderDuration: 42.1,
      slowRenderCount: 3,
    })
    const hook = fakeHook({
      resolveDomComponent: () => "c:2" as ComponentId,
      componentRecord: (id) => (id === "c:2" ? userCardRecord : appRecord),
      componentAncestry: () => [appRecord, userCardRecord],
    })
    const { controller, setHits } = setup({ hook, options: { picker: { openOnClick: false } } })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent())

    const { ancestry } = controller.getState()
    expect(ancestry.map((a) => ({ id: a.id, renderDuration: a.renderDuration, slowRenderCount: a.slowRenderCount }))).toEqual([
      { id: "c:1", renderDuration: 2.5, slowRenderCount: 0 },
      { id: "c:2", renderDuration: 42.1, slowRenderCount: 3 },
    ])
  })

  it("orders selectedComponentChoices element-first, then view, then declaration — only the ones that resolve (§9.3, §2.4)", () => {
    const clickTarget = document.createElement("article")
    stubRect(clickTarget, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(clickTarget)
    const rangeNode = document.createElement("span")
    document.body.appendChild(rangeNode)

    const elementLoc: SourceLocation = { ...elementSource, line: 100, column: 1 }
    const viewLoc: SourceLocation = { ...elementSource, kind: "component-view", line: 200, column: 2 }
    const declLoc: SourceLocation = { ...elementSource, kind: "component-declaration", line: 300, column: 3 }
    const record = componentRecord({
      id: "c:5" as ComponentId,
      domRange: { first: rangeNode, last: rangeNode },
      source: declLoc,
    })
    const hook = fakeHook({
      resolveDomComponent: () => "c:5" as ComponentId,
      componentRecord: () => record,
      componentAncestry: () => [record],
      resolveDomSource: (node) => (node === rangeNode ? elementLoc : null),
      componentViewSource: () => viewLoc,
    })
    const { controller, setHits } = setup({ hook, options: { picker: { openOnClick: false } } })
    controller.startPicker()
    setHits([clickTarget])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent())

    const choices = controller.getState().selectedComponentChoices
    expect(choices.map((c) => c.kind)).toEqual(["element", "view", "declaration"])
    expect(choices.map((c) => c.location.line)).toEqual([100, 200, 300])
    expect(choices.every((c) => c.mapping.location !== null)).toBe(true)
  })

  it("omits choices that don't resolve (only the declaration exists)", () => {
    const clickTarget = document.createElement("article")
    stubRect(clickTarget, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(clickTarget)

    const declLoc: SourceLocation = { ...elementSource, kind: "component-declaration", line: 300 }
    const record = componentRecord({ id: "c:6" as ComponentId, domRange: null, source: declLoc })
    const hook = fakeHook({
      resolveDomComponent: () => "c:6" as ComponentId,
      componentRecord: () => record,
      componentAncestry: () => [record],
      resolveDomSource: () => null,
      componentViewSource: () => null,
    })
    const { controller, setHits } = setup({ hook, options: { picker: { openOnClick: false } } })
    controller.startPicker()
    setHits([clickTarget])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent())

    const choices = controller.getState().selectedComponentChoices
    expect(choices.map((c) => c.kind)).toEqual(["declaration"])
  })

  it("focusAncestor highlights the ancestor's own DOM range (possibly multi-node) and records it as focused", () => {
    const a = document.createElement("p")
    const b = document.createElement("p")
    document.body.append(a, b)
    stubRect(a, { left: 1, top: 1, width: 2, height: 2 })
    stubRect(b, { left: 3, top: 3, width: 4, height: 4 })

    const record = componentRecord({ id: "c:9" as ComponentId, domRange: { first: a, last: b } })
    const hook = fakeHook({ componentRecord: () => record })
    const { controller } = setup({ hook })

    controller.focusAncestor("c:9" as ComponentId)
    const state = controller.getState()
    expect(state.focusedAncestorId).toBe("c:9")
    expect(state.frozenRects).toEqual([
      { left: 1, top: 1, width: 2, height: 2 },
      { left: 3, top: 3, width: 4, height: 4 },
    ])
  })

  it("degrades to the selection's own highlight when the focused ancestor has no live DOM range", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)
    const { controller, setHits } = setup({ options: { picker: { openOnClick: false } } })
    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent())
    expect(controller.getState().frozenRects).toEqual([{ left: 0, top: 0, width: 10, height: 10 }])

    // The default fake hook's componentRecord has no domRange at all.
    controller.focusAncestor("c:1" as ComponentId)
    expect(controller.getState().focusedAncestorId).toBe("c:1")
    expect(controller.getState().frozenRects).toEqual([{ left: 0, top: 0, width: 10, height: 10 }])
  })

  it("revealComponent opens the most-precise choice by default", () => {
    const rangeNode = document.createElement("span")
    document.body.appendChild(rangeNode)
    const elementLoc: SourceLocation = { ...elementSource, line: 10 }
    const declLoc: SourceLocation = { ...elementSource, kind: "component-declaration", line: 20 }
    const record = componentRecord({
      id: "c:7" as ComponentId,
      domRange: { first: rangeNode, last: rangeNode },
      source: declLoc,
    })
    const openInEditor = vi.fn(async () => ({ ok: true }))
    const hook = fakeHook({
      componentRecord: () => record,
      resolveDomSource: (node) => (node === rangeNode ? elementLoc : null),
    })
    const { controller } = setup({ hook, openInEditor })

    controller.revealComponent("c:7" as ComponentId)
    expect(openInEditor).toHaveBeenCalledWith({ file: elementLoc.relativeFile, line: 10, column: elementLoc.column })
  })

  it("revealComponent opens a specific requested kind, not just the default", () => {
    const rangeNode = document.createElement("span")
    document.body.appendChild(rangeNode)
    const elementLoc: SourceLocation = { ...elementSource, line: 10 }
    const declLoc: SourceLocation = { ...elementSource, kind: "component-declaration", line: 20 }
    const record = componentRecord({
      id: "c:7" as ComponentId,
      domRange: { first: rangeNode, last: rangeNode },
      source: declLoc,
    })
    const openInEditor = vi.fn(async () => ({ ok: true }))
    const hook = fakeHook({
      componentRecord: () => record,
      resolveDomSource: (node) => (node === rangeNode ? elementLoc : null),
    })
    const { controller } = setup({ hook, openInEditor })

    controller.revealComponent("c:7" as ComponentId, "declaration")
    expect(openInEditor).toHaveBeenCalledWith({ file: declLoc.relativeFile, line: 20, column: declLoc.column })
  })

  it("records a diagnostic and does not open the editor when the component has no source location", () => {
    const record = componentRecord({ id: "c:8" as ComponentId })
    const openInEditor = vi.fn(async () => ({ ok: true }))
    const hook = fakeHook({
      componentRecord: () => record,
      resolveDomSource: () => null,
      componentViewSource: () => null,
    })
    const { controller } = setup({ hook, openInEditor })

    controller.revealComponent("c:8" as ComponentId)
    expect(openInEditor).not.toHaveBeenCalled()
    expect(controller.getState().diagnostics.length).toBeGreaterThan(0)
  })

  it("resets the focused ancestor when a new element is selected", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)
    const { controller, setHits } = setup({ options: { picker: { openOnClick: false } } })
    controller.focusAncestor("c:1" as ComponentId)
    expect(controller.getState().focusedAncestorId).toBe("c:1")

    controller.startPicker()
    setHits([el])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent())
    expect(controller.getState().focusedAncestorId).toBeNull()
  })

  it("resets the focused ancestor on clearSelection", () => {
    const { controller } = setup()
    controller.focusAncestor("c:1" as ComponentId)
    controller.clearSelection()
    expect(controller.getState().focusedAncestorId).toBeNull()
  })
})

describe("Components tab: tree/search/pin/attrs+state (task 0022)", () => {
  function snapshotOf(records: ComponentRecord[]): InspectorSnapshot {
    return {
      components: new Map(records.map((r) => [r.id, r])),
      vnodes: new Map(),
      modules: new Map(),
      domAssociations: new Map(),
    }
  }

  it("seeds the tree from getSnapshot() at construction and subscribes for batched updates", () => {
    const getSnapshot = vi.fn(() =>
      snapshotOf([componentRecord({ id: "c:1" as ComponentId, displayName: "App" })]),
    )
    const listeners: Array<(event: RuntimeEvent) => void> = []
    const subscribe = vi.fn((fn: (event: RuntimeEvent) => void) => {
      listeners.push(fn)
      return () => {}
    })
    const { controller, redraw } = setup({ hook: fakeHook({ getSnapshot, subscribe }) })

    expect(getSnapshot).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
    expect(controller.getState().componentTree.rows.map((r) => r.record.displayName)).toEqual(["App"])

    listeners[0]?.({
      type: "components-added",
      records: [componentRecord({ id: "c:2" as ComponentId, displayName: "Child" })],
    })
    expect(redraw).toHaveBeenCalled()
    expect(controller.getState().componentTree.rows.map((r) => r.record.displayName)).toEqual(["App", "Child"])
  })

  it("does not seed or subscribe when componentTree.enabled is false", () => {
    const getSnapshot = vi.fn(() => snapshotOf([]))
    const subscribe = vi.fn(() => () => {})
    const { controller } = setup({
      hook: fakeHook({ getSnapshot, subscribe }),
      options: { componentTree: { enabled: false } },
    })

    expect(getSnapshot).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    expect(controller.getState().componentTree.gating.enabled).toBe(false)
    expect(controller.getState().componentTree.rows).toEqual([])
  })

  it("setTreeSearch/toggleTreeNode/togglePinned mutate tree state and redraw", () => {
    const getSnapshot = () =>
      snapshotOf([
        componentRecord({ id: "c:1" as ComponentId, displayName: "App", childIds: ["c:2" as ComponentId] }),
        componentRecord({ id: "c:2" as ComponentId, displayName: "Child", parentId: "c:1" as ComponentId }),
      ])
    const { controller, redraw } = setup({ hook: fakeHook({ getSnapshot }) })

    controller.setTreeSearch("child")
    expect(controller.getState().componentTree.search).toBe("child")
    expect(controller.getState().componentTree.rows.map((r) => r.record.displayName)).toEqual(["App", "Child"])
    expect(redraw).toHaveBeenCalled()

    controller.setTreeSearch("")
    controller.toggleTreeNode("c:1" as ComponentId)
    expect(controller.getState().componentTree.rows.map((r) => r.record.displayName)).toEqual(["App"])

    controller.togglePinned("c:1" as ComponentId)
    expect(controller.getState().componentTree.pinned.map((p) => p.record.displayName)).toEqual(["App"])
  })

  it("selectComponent resolves the component's representative element and syncs the shared selection (§9.3)", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 1, top: 2, width: 3, height: 4 })
    document.body.appendChild(el)
    const record = componentRecord({ id: "c:5" as ComponentId, domRange: { first: el, last: el } })
    const hook = fakeHook({ componentRecord: () => record, resolveDomSource: () => elementSource })
    const { controller } = setup({ hook })

    controller.focusAncestor("c:9" as ComponentId) // pre-existing focus must be cleared by a new selection
    controller.selectComponent("c:5" as ComponentId)

    const state = controller.getState()
    expect(state.selection.componentId).toBe("c:5")
    expect(state.selection.node).toBe(el)
    expect(state.focusedAncestorId).toBeNull()
    expect(state.frozenRects).toHaveLength(1)
  })

  it("selectComponent falls back to a text node's parentElement when the range's first node isn't an Element", () => {
    const parent = document.createElement("div")
    const text = document.createTextNode("hi")
    parent.appendChild(text)
    document.body.appendChild(parent)
    const record = componentRecord({ id: "c:6" as ComponentId, domRange: { first: text, last: text } })
    const hook = fakeHook({ componentRecord: () => record })
    const { controller } = setup({ hook })

    controller.selectComponent("c:6" as ComponentId)
    expect(controller.getState().selection.node).toBe(parent)
  })

  it("selectComponent records a diagnostic when the component is no longer available", () => {
    const hook = fakeHook({ componentRecord: () => undefined })
    const { controller } = setup({ hook })
    controller.selectComponent("c:404" as ComponentId)
    expect(controller.getState().diagnostics.length).toBeGreaterThan(0)
    expect(controller.getState().selection.componentId).toBeNull()
  })

  it("selectComponent records a diagnostic when the component has no associated DOM", () => {
    const record = componentRecord({ id: "c:7" as ComponentId, domRange: null })
    const hook = fakeHook({ componentRecord: () => record })
    const { controller } = setup({ hook })
    controller.selectComponent("c:7" as ComponentId)
    expect(controller.getState().diagnostics.length).toBeGreaterThan(0)
  })

  it("scrollComponentIntoView scrolls the representative element", () => {
    const el = document.createElement("article")
    document.body.appendChild(el)
    const scrollIntoView = vi.fn()
    el.scrollIntoView = scrollIntoView
    const record = componentRecord({ id: "c:5" as ComponentId, domRange: { first: el, last: el } })
    const hook = fakeHook({ componentRecord: () => record })
    const { controller } = setup({ hook })

    controller.scrollComponentIntoView("c:5" as ComponentId)
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "nearest" }))
  })

  it("expandComponentPreview merges a fetched replacement into the overrides map for the selected component", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const record = componentRecord({ id: "c:5" as ComponentId, domRange: { first: el, last: el } })
    const replacement: PreviewNode = { kind: "primitive", type: "number", value: 42 }
    const expandPreview = vi.fn(() => replacement)
    const hook = fakeHook({ componentRecord: () => record, expandPreview })
    const { controller } = setup({ hook })
    controller.selectComponent("c:5" as ComponentId)

    controller.expandComponentPreview("attrs", [{ kind: "prop", key: "user" }])
    expect(expandPreview).toHaveBeenCalledWith("c:5", "attrs", [{ kind: "prop", key: "user" }], undefined)
    expect(controller.getState().componentTree.attrsOverrides.get("prop:user")).toEqual(replacement)
  })

  it("expandComponentPreview is a no-op when nothing is selected", () => {
    const expandPreview = vi.fn(() => null)
    const { controller } = setup({ hook: fakeHook({ expandPreview }) })
    controller.expandComponentPreview("attrs", [{ kind: "prop", key: "user" }])
    expect(expandPreview).not.toHaveBeenCalled()
  })

  it("expandComponentPreview also marks the fetched path expanded (an explicit fetch opens straight to its rows)", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const record = componentRecord({ id: "c:5" as ComponentId, domRange: { first: el, last: el } })
    const replacement: PreviewNode = { kind: "primitive", type: "number", value: 42 }
    const hook = fakeHook({ componentRecord: () => record, expandPreview: () => replacement })
    const { controller } = setup({ hook })
    controller.selectComponent("c:5" as ComponentId)

    expect(controller.getState().componentTree.expandedAttrsPaths.has("prop:user")).toBe(false)
    controller.expandComponentPreview("attrs", [{ kind: "prop", key: "user" }])
    expect(controller.getState().componentTree.expandedAttrsPaths.has("prop:user")).toBe(true)
  })

  it("togglePreviewExpanded flips a path's local expand state without touching fetch overrides", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const record = componentRecord({ id: "c:5" as ComponentId, domRange: { first: el, last: el } })
    const { controller } = setup({ hook: fakeHook({ componentRecord: () => record }) })
    controller.selectComponent("c:5" as ComponentId)
    const path = [{ kind: "prop" as const, key: "tasks" }, { kind: "index" as const, index: 0 }]

    controller.togglePreviewExpanded("state", path)
    expect(controller.getState().componentTree.expandedStatePaths.has("prop:tasks/index:0")).toBe(true)
    expect(controller.getState().componentTree.stateOverrides.size).toBe(0)

    controller.togglePreviewExpanded("state", path)
    expect(controller.getState().componentTree.expandedStatePaths.has("prop:tasks/index:0")).toBe(false)
  })

  it("clearing the selection resets local preview expand state", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const record = componentRecord({ id: "c:5" as ComponentId, domRange: { first: el, last: el } })
    const { controller } = setup({ hook: fakeHook({ componentRecord: () => record }) })
    controller.selectComponent("c:5" as ComponentId)
    controller.togglePreviewExpanded("attrs", [{ kind: "prop", key: "a" }])
    expect(controller.getState().componentTree.expandedAttrsPaths.size).toBe(1)

    controller.clearSelection()
    controller.selectComponent("c:5" as ComponentId)
    expect(controller.getState().componentTree.expandedAttrsPaths.size).toBe(0)
  })

  it("gates attrs/state previews on mode:full and componentTree.captureAttrs/captureState (§11.1, §17)", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const record = componentRecord({ id: "c:5" as ComponentId, domRange: { first: el, last: el } })
    const attrsNode: PreviewNode = { kind: "object", className: "Object", size: 0, entries: [], offset: 0, truncated: false, path: [] }
    const hook = fakeHook({
      componentRecord: () => record,
      getMode: () => "source",
      attrsPreview: () => attrsNode,
      statePreview: () => attrsNode,
    })
    const { controller } = setup({ hook, options: { componentTree: { captureAttrs: true, captureState: true } } })
    controller.selectComponent("c:5" as ComponentId)

    // mode is "source", not "full" — previews stay gated off even though captureAttrs/captureState are on.
    expect(controller.getState().componentTree.attrsPreview).toBeNull()
    expect(controller.getState().componentTree.statePreview).toBeNull()
    expect(controller.getState().componentTree.gating.fullMode).toBe(false)
  })

  it("shows attrs/state previews once mode is full and capture flags are on", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const record = componentRecord({ id: "c:5" as ComponentId, domRange: { first: el, last: el } })
    const attrsNode: PreviewNode = { kind: "primitive", type: "string", value: "hi" }
    const hook = fakeHook({
      componentRecord: () => record,
      getMode: () => "full",
      attrsPreview: () => attrsNode,
      statePreview: () => null,
    })
    const { controller } = setup({ hook, options: { componentTree: { captureAttrs: true, captureState: false } } })
    controller.selectComponent("c:5" as ComponentId)

    expect(controller.getState().componentTree.attrsPreview).toEqual(attrsNode)
    // captureState is off, so statePreview must stay gated even though hook.statePreview would return null anyway.
    expect(controller.getState().componentTree.statePreview).toBeNull()
  })

  it("dispose() unsubscribes from the runtime", () => {
    const unsubscribe = vi.fn()
    const hook = fakeHook({ subscribe: () => unsubscribe })
    const { controller } = setup({ hook })
    controller.dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

describe("State History tab (task 0027)", () => {
  const el = (): HTMLElement => {
    const node = document.createElement("div")
    document.body.appendChild(node)
    return node
  }

  function historyHook(overrides: Partial<OverlayHook> = {}, statePreviewValues: PreviewNode[] = []): {
    hook: FakeHook
    listeners: Array<(event: RuntimeEvent) => void>
  } {
    const listeners: Array<(event: RuntimeEvent) => void> = []
    let call = 0
    // selectComponent() needs a representative DOM element to resolve
    // (representativeElementOf(record.domRange)) or it bails before ever
    // watching the component — every fake record gets one by default.
    const domNode = el()
    const hook = fakeHook({
      getMode: () => "full",
      resolveDomComponent: () => "c:1" as ComponentId,
      componentRecord: (id) => componentRecord({ id, domRange: { first: domNode, last: domNode } }),
      subscribe: (fn) => {
        listeners.push(fn)
        return () => {}
      },
      statePreview: () => statePreviewValues[Math.min(call++, statePreviewValues.length - 1)] ?? null,
      ...overrides,
    })
    return { hook, listeners }
  }

  const num = (value: number): PreviewNode => ({ kind: "primitive", type: "number", value })

  it("seeds an initial snapshot on selection, then records another when the watched component reports components-updated, gated by mode:full + captureState", () => {
    const { hook, listeners } = historyHook({}, [num(1), num(2)])
    const { controller } = setup({ hook, options: { componentTree: { enabled: true, captureState: true } } })
    controller.selectComponent("c:1" as ComponentId)
    expect(controller.getState().history.entries).toHaveLength(1)
    expect(controller.getState().history.entries[0]?.state).toEqual(num(1))

    listeners[0]?.({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 1 }] })

    const entries = controller.getState().history.entries
    expect(entries).toHaveLength(2)
    expect(entries[1]?.state).toEqual(num(2))
  })

  it("does not record when mode isn't full, even if a components-updated event fires for the watched component", () => {
    const { hook, listeners } = historyHook({ getMode: () => "source" }, [num(1)])
    const { controller } = setup({ hook, options: { componentTree: { enabled: true, captureState: true } } })
    controller.selectComponent("c:1" as ComponentId)

    listeners[0]?.({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 1 }] })
    expect(controller.getState().history.entries).toEqual([])
    expect(controller.getState().history.gating.fullMode).toBe(false)
  })

  it("does not record when componentTree.captureState is off", () => {
    const { hook, listeners } = historyHook({}, [num(1)])
    const { controller } = setup({ hook, options: { componentTree: { enabled: true, captureState: false } } })
    controller.selectComponent("c:1" as ComponentId)

    listeners[0]?.({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 1 }] })
    expect(controller.getState().history.entries).toEqual([])
  })

  it("ignores a components-updated event for a component other than the one being watched", () => {
    const { hook, listeners } = historyHook({}, [num(1)])
    const { controller } = setup({ hook, options: { componentTree: { enabled: true, captureState: true } } })
    controller.selectComponent("c:1" as ComponentId)
    expect(controller.getState().history.entries).toHaveLength(1) // the initial seed

    listeners[0]?.({ type: "components-updated", records: [{ id: "c:99" as ComponentId, updateCount: 1 }] })
    expect(controller.getState().history.entries).toHaveLength(1)
  })

  it("resets the buffer when selectComponent() switches to a different component, seeding the new one's current state", () => {
    const { hook, listeners } = historyHook({}, [num(1), num(2), num(9)])
    const { controller } = setup({ hook, options: { componentTree: { enabled: true, captureState: true } } })
    controller.selectComponent("c:1" as ComponentId)
    listeners[0]?.({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 1 }] })
    expect(controller.getState().history.entries).toHaveLength(2) // seed + update

    controller.selectComponent("c:2" as ComponentId)
    expect(controller.getState().history.entries).toHaveLength(1) // reset, then reseeded for c:2
    expect(controller.getState().history.entries[0]?.state).toEqual(num(9))
    expect(controller.getState().history.watchedComponentId).toBe("c:2")
  })

  it("resets the buffer and stops watching on clearSelection()", () => {
    const { hook, listeners } = historyHook({}, [num(1), num(2)])
    const { controller } = setup({ hook, options: { componentTree: { enabled: true, captureState: true } } })
    controller.selectComponent("c:1" as ComponentId)
    listeners[0]?.({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 1 }] })
    expect(controller.getState().history.entries).toHaveLength(2)

    controller.clearSelection()
    expect(controller.getState().history.entries).toEqual([])
    expect(controller.getState().history.watchedComponentId).toBeNull()
  })

  it("re-watches whatever promoteStaleSelection() resolves to, clearing the prior component's buffer and seeding the new one", () => {
    const parent = document.createElement("section")
    const child = document.createElement("article")
    parent.appendChild(child)
    document.body.appendChild(parent)
    stubRect(parent, { left: 0, top: 0, width: 100, height: 100 })
    stubRect(child, { left: 5, top: 5, width: 10, height: 10 })

    const { hook, listeners } = historyHook(
      { resolveDomComponent: (node) => (node === child ? ("c:1" as ComponentId) : ("c:2" as ComponentId)) },
      [num(1), num(2), num(3)],
    )
    const { controller, setHits } = setup({ hook, options: { componentTree: { enabled: true, captureState: true } } })

    controller.startPicker()
    setHits([child])
    controller.handlePointerMove(6, 6)
    controller.handleClick(clickEvent())
    expect(controller.getState().history.watchedComponentId).toBe("c:1")
    expect(controller.getState().history.entries).toHaveLength(1) // the initial seed
    listeners[0]?.({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 1 }] })
    expect(controller.getState().history.entries).toHaveLength(2)

    parent.removeChild(child) // the selection goes stale (§8.8)
    expect(controller.getState().selection.stale).toBe(true)

    controller.promoteStaleSelection() // promotes to `parent`, which resolves to c:2
    expect(controller.getState().history.watchedComponentId).toBe("c:2")
    expect(controller.getState().history.entries).toHaveLength(1) // reseeded for c:2
    expect(controller.getState().history.entries[0]?.state).toEqual(num(3))
  })

  it("watches whatever a picker click resolves to, keyed off the click's own componentId", () => {
    const other = el()
    const { hook, listeners } = historyHook(
      { resolveDomComponent: (node) => (node === other ? ("c:2" as ComponentId) : ("c:1" as ComponentId)) },
      [num(1), num(2)],
    )
    const { controller, setHits } = setup({ hook, options: { componentTree: { enabled: true, captureState: true } } })

    controller.startPicker()
    setHits([other])
    controller.handlePointerMove(1, 1)
    controller.handleClick(clickEvent())
    expect(controller.getState().history.watchedComponentId).toBe("c:2")
    expect(controller.getState().history.entries).toHaveLength(1) // the initial seed

    listeners[0]?.({ type: "components-updated", records: [{ id: "c:2" as ComponentId, updateCount: 1 }] })
    expect(controller.getState().history.entries).toHaveLength(2)
    // A patch for the component that's no longer watched must not leak in.
    listeners[0]?.({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 1 }] })
    expect(controller.getState().history.entries).toHaveLength(2)
  })

  it("selectHistoryEntry() picks which entry selectedDiff() compares, defaulting to the latest", () => {
    const { hook, listeners } = historyHook({}, [num(1), num(2), num(5), num(9)])
    const { controller } = setup({ hook, options: { componentTree: { enabled: true, captureState: true } } })
    controller.selectComponent("c:1" as ComponentId) // seeds entry 0: num(1)
    for (let i = 0; i < 3; i += 1) {
      listeners[0]?.({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: i + 1 }] })
    }
    const entries = controller.getState().history.entries
    expect(entries).toHaveLength(4)

    // Default (nothing selected): diffs the latest entry against its predecessor (5 -> 9).
    expect(controller.getState().history.diff).toEqual([{ key: "(value)", kind: "changed", before: num(5), after: num(9) }])

    // Explicitly selecting the first (seeded) entry: no predecessor, whole-value "added".
    controller.selectHistoryEntry(entries[0]!.id)
    expect(controller.getState().history.selectedEntryId).toBe(entries[0]!.id)
    expect(controller.getState().history.diff).toEqual([{ key: "(value)", kind: "added", before: null, after: num(1) }])
  })

  it("keeps following new snapshots through the controller after selecting the then-latest entry (task 0028 regression)", () => {
    const { hook, listeners } = historyHook({}, [num(1), num(2), num(3), num(4)])
    const { controller } = setup({ hook, options: { componentTree: { enabled: true, captureState: true } } })
    controller.selectComponent("c:1" as ComponentId) // seeds entry 0: num(1)
    listeners[0]?.({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 1 }] })
    listeners[0]?.({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 2 }] })

    const latest = controller.getState().history.entries.at(-1)!
    controller.selectHistoryEntry(latest.id) // click the row that is, right now, the latest one
    expect(controller.getState().history.diff).toEqual([{ key: "(value)", kind: "changed", before: num(2), after: num(3) }])

    listeners[0]?.({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 3 }] })
    // Must have advanced to the new latest entry's diff, not stayed pinned to the old one.
    expect(controller.getState().history.diff).toEqual([{ key: "(value)", kind: "changed", before: num(3), after: num(4) }])
  })
})

describe("persistence across a reload (task 0022 follow-up)", () => {
  it("survives a Vite full-reload's fresh controller construction: activeTab and Components-tab search are restored from the same storage", () => {
    const storage = memoryStorage()
    // "Before the reload": open the Components tab and type a search query.
    const before = setup({ storage })
    before.controller.setActiveTab("components")
    before.controller.setTreeSearch("UserCard")
    expect(before.controller.getState().activeTab).toBe("components")

    // "After the reload": a brand-new controller reading the same storage
    // (exactly what a Vite ws-disconnect -> location.reload() produces —
    // §8.1's existing collapsed/offset persistence uses the identical
    // mechanism, this just extends what's saved).
    const after = setup({ storage })
    const state = after.controller.getState()
    expect(state.activeTab).toBe("components")
    expect(state.componentTree.search).toBe("UserCard")
  })
})

describe("Redraw-flash visualization (task 0030)", () => {
  const domNode = (): HTMLElement => {
    const node = document.createElement("div")
    stubRect(node, { left: 1, top: 2, width: 30, height: 40 })
    document.body.appendChild(node)
    return node
  }

  const record = (target: Node, addedNodes: readonly Node[] = []): DomMutationLike => ({ target, addedNodes })

  function flashHook(overrides: Partial<OverlayHook> = {}): { hook: FakeHook; node: HTMLElement } {
    const node = domNode()
    const hook = fakeHook({
      getMode: () => "full",
      resolveDomComponent: (n) => (n === node ? ("c:1" as ComponentId) : null),
      componentRecord: (id) => componentRecord({ id, domRange: { first: node, last: node } }),
      ...overrides,
    })
    return { hook, node }
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it("flashes the component a mutation resolves to, with its current DOM-range rects", () => {
    const { hook, node } = flashHook()
    const { controller, redraw } = setup({ hook, options: { redrawFlash: { enabled: true } } })

    controller.recordDomMutations([record(node)])

    expect(controller.getState().flashes).toEqual([
      { componentId: "c:1", seq: expect.any(Number), rects: [{ left: 1, top: 2, width: 30, height: 40 }] },
    ])
    expect(redraw).toHaveBeenCalled()
  })

  it("does nothing when no mutation resolves to a tracked component", () => {
    const { hook } = flashHook({ resolveDomComponent: () => null })
    const { controller, redraw } = setup({ hook, options: { redrawFlash: { enabled: true } } })

    controller.recordDomMutations([record(document.createElement("span"))])

    expect(controller.getState().flashes).toEqual([])
    expect(redraw).not.toHaveBeenCalled()
  })

  it("skips a resolved component with no current DOM range (e.g. already unmounted)", () => {
    const { hook, node } = flashHook({ componentRecord: (id) => componentRecord({ id, domRange: null }) })
    const { controller, redraw } = setup({ hook, options: { redrawFlash: { enabled: true } } })

    controller.recordDomMutations([record(node)])

    expect(controller.getState().flashes).toEqual([])
    expect(redraw).not.toHaveBeenCalled()
  })

  it("stays off by default (redrawFlash.enabled defaults to false) even in mode: full", () => {
    const { hook, node } = flashHook()
    const { controller, redraw } = setup({ hook }) // no redrawFlash override -> default false

    controller.recordDomMutations([record(node)])

    expect(controller.getState().flashes).toEqual([])
    expect(redraw).not.toHaveBeenCalled()
  })

  it("stays off when mode isn't full, even with redrawFlash.enabled: true", () => {
    const { hook, node } = flashHook({ getMode: () => "components" })
    const { controller, redraw } = setup({ hook, options: { redrawFlash: { enabled: true } } })

    controller.recordDomMutations([record(node)])

    expect(controller.getState().flashes).toEqual([])
    expect(redraw).not.toHaveBeenCalled()
  })

  it("clears a flash automatically after its brief duration", () => {
    vi.useFakeTimers()
    const { hook, node } = flashHook()
    const { controller } = setup({ hook, options: { redrawFlash: { enabled: true } } })

    controller.recordDomMutations([record(node)])
    expect(controller.getState().flashes).toHaveLength(1)

    vi.advanceTimersByTime(10_000)
    expect(controller.getState().flashes).toEqual([])
  })

  it("refreshes (not duplicates) a still-flashing component and bumps its seq so the CSS animation restarts", () => {
    vi.useFakeTimers()
    const { hook, node } = flashHook()
    const { controller } = setup({ hook, options: { redrawFlash: { enabled: true } } })

    controller.recordDomMutations([record(node)])
    const first = controller.getState().flashes[0]!

    vi.advanceTimersByTime(50) // well within the flash duration
    controller.recordDomMutations([record(node)])
    const flashes = controller.getState().flashes
    expect(flashes).toHaveLength(1)
    expect(flashes[0]!.seq).not.toBe(first.seq)

    // The refreshed timer, not the original one, governs expiry: advancing
    // just past the *original* duration from the first mutation must not
    // clear it early.
    vi.advanceTimersByTime(360)
    expect(controller.getState().flashes).toHaveLength(1)
  })

  it("unions multiple components mutated in one batch (multi-root, task 0030 acceptance)", () => {
    const idA = "c:1" as ComponentId
    const idB = "c:2" as ComponentId
    const nodeA = domNode()
    const nodeB = domNode()
    const hook = fakeHook({
      getMode: () => "full",
      resolveDomComponent: (n) => (n === nodeA ? idA : n === nodeB ? idB : null),
      componentRecord: (id) => componentRecord({ id, domRange: { first: id === idA ? nodeA : nodeB, last: id === idA ? nodeA : nodeB } }),
    })
    const { controller } = setup({ hook, options: { redrawFlash: { enabled: true } } })

    controller.recordDomMutations([record(nodeB), record(nodeA)])

    const ids = controller.getState().flashes.map((f) => f.componentId).sort()
    expect(ids).toEqual([idA, idB].sort())
  })

  it("dispose() clears pending flash timers without throwing or redrawing afterwards", () => {
    vi.useFakeTimers()
    const { hook, node } = flashHook()
    const { controller, redraw } = setup({ hook, options: { redrawFlash: { enabled: true } } })
    controller.recordDomMutations([record(node)])
    redraw.mockClear()

    expect(() => controller.dispose()).not.toThrow()
    vi.advanceTimersByTime(10_000)
    expect(redraw).not.toHaveBeenCalled()
  })
})
