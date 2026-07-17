import type { ComponentId, ComponentRecord, SourceLocation } from "@mithril-inspector/protocol"
import m from "mithril"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { OverlayHook } from "./hook.js"
import { HOST_ID, mountInspectorOverlay, type OverlayHandle } from "./overlay.js"

const source: SourceLocation = {
  moduleId: "m:abc",
  sourceId: "s2",
  absoluteFile: "/project/src/UserCard.ts",
  relativeFile: "src/UserCard.ts",
  line: 17,
  column: 5,
  kind: "element",
}

function fakeHook(over: Partial<OverlayHook> = {}): OverlayHook & { excluded: Node[] } {
  const excluded: Node[] = []
  return {
    excluded,
    resolveDomSource: () => source,
    resolveDomComponent: () => "c:1" as ComponentId,
    componentRecord: (id) => ({ id, displayName: "UserCard" }) as ComponentRecord,
    sourceOfVnode: () => null,
    excludeHost: (host) => excluded.push(host),
    flush: () => {},
    ...over,
  }
}

let handle: OverlayHandle | null = null
let originalEfp: typeof document.elementsFromPoint

afterEach(() => {
  handle?.dispose()
  handle = null
  document.body.innerHTML = ""
  document.head.innerHTML = ""
  // Persisted collapsed/offset would otherwise leak across tests via the shared
  // jsdom localStorage.
  try {
    document.defaultView?.localStorage.clear()
  } catch {
    /* ignore */
  }
  if (originalEfp) document.elementsFromPoint = originalEfp
})

function render(): void {
  m.redraw.sync()
}

describe("mountInspectorOverlay — host & isolation", () => {
  it("mounts a shadow-root host and shows the collapsed tab by default (§8.1)", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    expect(handle).not.toBeNull()
    const host = document.getElementById(HOST_ID)
    expect(host).toBe(handle!.host)
    expect(handle!.shadowRoot.mode).toBe("open")
    render()
    expect(handle!.shadowRoot.querySelector(".mi-tab")).not.toBeNull()
    expect(handle!.shadowRoot.querySelector(".mi-panel")).toBeNull()
  })

  it("adds no global styles — the stylesheet lives inside the shadow root (§8.2)", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    const globalStyles = Array.from(document.querySelectorAll("style")).map((s) => s.textContent ?? "")
    expect(globalStyles.some((css) => css.includes(".mi-root"))).toBe(false)
    expect(handle!.shadowRoot.querySelector("style")?.textContent).toContain(".mi-root")
  })

  it("excludes the host from runtime tracking (§8.2)", () => {
    const hook = fakeHook()
    handle = mountInspectorOverlay({}, { hook })
    expect(hook.excluded).toContain(handle!.host)
  })

  it("honors a closed shadow-root option", () => {
    handle = mountInspectorOverlay({ closedShadowRoot: true }, { hook: fakeHook() })
    // A closed root is not exposed on the element, but the handle still carries it.
    expect(handle!.host.shadowRoot).toBeNull()
    expect(handle!.shadowRoot).toBeTruthy()
  })

  it("returns null when disabled", () => {
    expect(mountInspectorOverlay({ enabled: false }, { hook: fakeHook() })).toBeNull()
  })

  it("still mounts with no runtime hook present (degraded)", () => {
    handle = mountInspectorOverlay({}, { hook: null })
    render()
    expect(handle).not.toBeNull()
    expect(handle!.shadowRoot.querySelector(".mi-tab")).not.toBeNull()
  })
})

describe("mountInspectorOverlay — panel (§8.3)", () => {
  it("expands to a panel with Inspector/Components/Settings tabs", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    handle!.controller.setCollapsed(false)
    render()
    const tabs = Array.from(handle!.shadowRoot.querySelectorAll('[role="tab"]')).map((t) => t.textContent)
    expect(tabs).toEqual(["Inspector", "Components", "Settings"])
    expect(handle!.shadowRoot.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it("surfaces recorded diagnostics in the Settings panel (§16)", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    handle!.controller.diagnostics.record("hover", new Error("kaboom"))
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("settings")
    render()
    expect(handle!.shadowRoot.querySelector(".mi-diagnostics")?.textContent).toContain("kaboom")
  })
})

describe("mountInspectorOverlay — picker wiring (§8.4–8.7)", () => {
  it("toggles the picker from a captured Alt+Shift+M keydown", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    expect(handle!.controller.isPicking()).toBe(false)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "M", altKey: true, shiftKey: true }))
    expect(handle!.controller.isPicking()).toBe(true)
  })

  it("renders a highlight rectangle for the hovered element", () => {
    const app = document.createElement("article")
    app.getBoundingClientRect = () =>
      ({ left: 4, top: 8, width: 40, height: 20, right: 44, bottom: 28, x: 4, y: 8, toJSON: () => ({}) }) as DOMRect
    document.body.appendChild(app)

    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    handle!.controller.startPicker()
    // handlePointerMove resolves via doc.elementsFromPoint; stub it to hit the app node.
    originalEfp = document.elementsFromPoint
    document.elementsFromPoint = () => [app]
    handle!.controller.handlePointerMove(10, 10)
    render()

    const rect = handle!.shadowRoot.querySelector(".mi-rect") as HTMLElement | null
    expect(rect).not.toBeNull()
    expect(rect!.style.left).toBe("4px")
    expect(rect!.style.width).toBe("40px")
  })

  it("suppresses the application click handler on select (§8.7, browser criterion #9)", () => {
    const button = document.createElement("button")
    const appClick = vi.fn()
    button.addEventListener("click", appClick)
    button.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    document.body.appendChild(button)

    handle = mountInspectorOverlay({ picker: { openOnClick: false } }, { hook: fakeHook() })
    handle!.controller.startPicker()
    originalEfp = document.elementsFromPoint
    document.elementsFromPoint = () => [button]

    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    expect(appClick).not.toHaveBeenCalled()
    expect(handle!.controller.getState().selection.node).toBe(button)
  })

  it("dispose() removes the host and stops intercepting", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    handle!.dispose()
    expect(document.getElementById(HOST_ID)).toBeNull()
    // A subsequent toggle keydown must not reach a disposed controller.
    const controller = handle!.controller
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "M", altKey: true, shiftKey: true }))
    expect(controller.isPicking()).toBe(false)
    handle = null
  })

  it("applies and persists a drag offset as a transform (§8.1 movable)", () => {
    const store = document.defaultView!.localStorage
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    handle!.controller.setOffset({ x: 24, y: -12 })
    render()

    const tab = handle!.shadowRoot.querySelector(".mi-tab") as HTMLElement
    expect(tab).not.toBeNull()
    expect(tab.style.transform.replace(/\s+/g, "")).toBe("translate(24px,-12px)")
    // Offset was persisted so it survives a reload.
    expect(store.getItem("__mithril-inspector-overlay")).toContain('"offset"')
  })

  it("replaces a prior host instead of duplicating it (HMR remount)", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    const second = mountInspectorOverlay({}, { hook: fakeHook() })
    expect(document.querySelectorAll(`#${HOST_ID}`).length).toBe(1)
    second?.dispose()
  })
})

describe("mountInspectorOverlay — modal <dialog> detection (§8.2 known limitation)", () => {
  let originalQuerySelector: typeof document.querySelector

  afterEach(() => {
    if (originalQuerySelector) document.querySelector = originalQuerySelector
  })

  it("records a diagnostic when a native dialog becomes modal (jsdom has no real :modal, so querySelector is stubbed)", async () => {
    const dialog = document.createElement("dialog")
    document.body.appendChild(dialog)

    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    expect(handle!.controller.diagnostics.list()).toHaveLength(0)

    originalQuerySelector = document.querySelector.bind(document)
    document.querySelector = ((selector: string) => (selector === ":modal" ? dialog : originalQuerySelector(selector))) as typeof document.querySelector

    dialog.setAttribute("open", "")
    // MutationObserver callbacks land in a microtask after the current task.
    await new Promise<void>((resolve) => queueMicrotask(resolve))

    const diagnostics = handle!.controller.diagnostics.list()
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.feature).toBe("modal-dialog")
    expect(diagnostics[0]?.message).toContain("top-layer")
  })

  it("does not re-record while the dialog stays modal, but does after it closes and reopens", async () => {
    const dialog = document.createElement("dialog")
    document.body.appendChild(dialog)

    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    originalQuerySelector = document.querySelector.bind(document)
    let modal = false
    document.querySelector = ((selector: string) => (selector === ":modal" ? (modal ? dialog : null) : originalQuerySelector(selector))) as typeof document.querySelector

    modal = true
    dialog.setAttribute("open", "")
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    dialog.setAttribute("open", "open") // still modal, re-set to trigger another mutation
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(handle!.controller.diagnostics.list()).toHaveLength(1)

    modal = false
    dialog.removeAttribute("open")
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    modal = true
    dialog.setAttribute("open", "")
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(handle!.controller.diagnostics.list()).toHaveLength(2)
  })

  it("dispose() disconnects the observer", async () => {
    const dialog = document.createElement("dialog")
    document.body.appendChild(dialog)

    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    originalQuerySelector = document.querySelector.bind(document)
    document.querySelector = ((selector: string) => (selector === ":modal" ? dialog : originalQuerySelector(selector))) as typeof document.querySelector

    const controller = handle!.controller
    handle!.dispose()
    handle = null

    dialog.setAttribute("open", "")
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(controller.diagnostics.list()).toHaveLength(0)
  })
})
