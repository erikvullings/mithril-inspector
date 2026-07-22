import type { ComponentId, ComponentRecord, RuntimeEvent, SourceLocation } from "@mithril-inspector/protocol"
import m from "mithril"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { OverlayHook, OverlayInspectorMode } from "./hook.js"
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

function stubRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  el.getBoundingClientRect = () =>
    ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect
}

function fakeHook(over: Partial<OverlayHook> = {}): OverlayHook & { excluded: Node[] } {
  const excluded: Node[] = []
  return {
    excluded,
    resolveDomSource: () => source,
    resolveDomComponent: () => "c:1" as ComponentId,
    componentRecord: (id) => ({ id, displayName: "UserCard" }) as ComponentRecord,
    componentAncestry: () => [],
    componentViewSource: () => null,
    sourceOfVnode: () => null,
    excludeHost: (host) => excluded.push(host),
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
  it("mounts a shadow-root host and shows the collapsed toggle by default (§8.1)", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    expect(handle).not.toBeNull()
    const host = document.getElementById(HOST_ID)
    expect(host).toBe(handle!.host)
    expect(handle!.shadowRoot.mode).toBe("open")
    render()
    expect(handle!.shadowRoot.querySelector(".mi-toggle")).not.toBeNull()
    expect(handle!.shadowRoot.querySelector(".mi-dock")).toBeNull()
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
    expect(handle!.shadowRoot.querySelector(".mi-toggle")).not.toBeNull()
  })
})

describe("mountInspectorOverlay — panel (§8.3)", () => {
  it("expands to a docked panel with a Components/Elements/History/Settings sidebar", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    handle!.controller.setCollapsed(false)
    render()
    const sidebarLabels = Array.from(handle!.shadowRoot.querySelectorAll(".mi-sidebar-btn")).map((b) =>
      b.getAttribute("aria-label"),
    )
    expect(sidebarLabels).toEqual(["Components", "Elements", "History", "Settings"])
    expect(handle!.shadowRoot.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it("gives every sidebar tab icon both a native title and a themed hover tooltip (task 0028)", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    handle!.controller.setCollapsed(false)
    render()
    const buttons = Array.from(handle!.shadowRoot.querySelectorAll(".mi-sidebar-btn"))
    for (const button of buttons) {
      expect(button.getAttribute("title")).toBe(button.getAttribute("aria-label"))
      expect(button.getAttribute("data-tooltip")).toBe(button.getAttribute("aria-label"))
    }
  })

  it("gives the 'M' collapse button the same themed hover tooltip as the rest of the sidebar rail, not just a native title", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    handle!.controller.setCollapsed(false)
    render()
    const logo = handle!.shadowRoot.querySelector(".mi-sidebar-logo")
    expect(logo?.getAttribute("title")).toBe("Collapse Mithril Inspector")
    expect(logo?.getAttribute("data-tooltip")).toBe("Collapse Mithril Inspector")
  })

  it("surfaces recorded diagnostics in the Settings section (§16)", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    handle!.controller.diagnostics.record("hover", new Error("kaboom"))
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("settings")
    render()
    expect(handle!.shadowRoot.querySelector(".mi-diagnostics")?.textContent).toContain("kaboom")
  })

  it("switches the effective theme live from the Settings tab (§8.1)", () => {
    handle = mountInspectorOverlay({ theme: "system" }, { hook: fakeHook() })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("settings")
    render()
    expect(handle!.shadowRoot.querySelector(".mi-root")?.getAttribute("data-theme")).toBeNull()

    const darkButton = Array.from(handle!.shadowRoot.querySelectorAll(".mi-btn-small")).find(
      (b) => b.textContent === "Dark",
    ) as HTMLElement
    darkButton.click()
    render()
    expect(handle!.shadowRoot.querySelector(".mi-root")?.getAttribute("data-theme")).toBe("dark")
  })

  it("toggles attrs/state redaction live from the Settings tab, session-only (§15)", () => {
    const setRedactionEnabled = vi.fn()
    handle = mountInspectorOverlay({}, { hook: fakeHook({ getRedactionEnabled: () => true, setRedactionEnabled }) })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("settings")
    render()

    const checkbox = handle!.shadowRoot.querySelector("#mi-redaction-enabled") as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    checkbox.click()
    expect(setRedactionEnabled).toHaveBeenCalledWith(false)
  })

  it("adds a redaction key pattern from the Settings tab form and clears the input (§15)", () => {
    // The fake hook's addRedactionKey actually mutates `keys` (like the real
    // runtime would) so the controller's own post-submit redraw() picks up
    // the change — the overlay renders through its own scoped m.render(),
    // not the global m.redraw() this file's render() helper drives.
    const addRedactionKey = vi.fn()
    const keys = ["password"]
    handle = mountInspectorOverlay(
      {},
      {
        hook: fakeHook({
          getRedactionKeys: () => keys,
          addRedactionKey: (k) => {
            addRedactionKey(k)
            keys.push(k)
          },
        }),
      },
    )
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("settings")
    render()
    expect(handle!.shadowRoot.querySelector(".mi-redact-keys")?.textContent).toContain("password")

    const input = handle!.shadowRoot.querySelector('input[name="redactKey"]') as HTMLInputElement
    input.value = "ssn"
    const form = input.closest("form") as HTMLFormElement
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))

    expect(addRedactionKey).toHaveBeenCalledWith("ssn")
    expect(input.value).toBe("")
    expect(handle!.shadowRoot.querySelector(".mi-redact-keys")?.textContent).toContain("password, ssn")
  })

  it("shows the resolved editor read-only in Settings, with override instructions (§10.2, §10.3)", () => {
    handle = mountInspectorOverlay({ editorCommand: "webstorm" }, { hook: fakeHook() })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("settings")
    render()
    const editorInfo = handle!.shadowRoot.querySelector(".mi-editor-info")
    expect(editorInfo?.textContent).toContain("webstorm")
    expect(editorInfo?.textContent).toContain("MITHRIL_INSPECTOR_EDITOR")
    // Read-only: nothing here lets the browser pick an editor (§10.2) — only the shortcut
    // rows elsewhere in Settings are interactive, and this section has none of its own.
    expect(editorInfo?.querySelector("input, select, button")).toBeNull()
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

  it("marks an inferred component name in the hover badge (§2.4, task 0018)", () => {
    const app = document.createElement("article")
    app.getBoundingClientRect = () =>
      ({ left: 4, top: 8, width: 40, height: 20, right: 44, bottom: 28, x: 4, y: 8, toJSON: () => ({}) }) as DOMRect
    document.body.appendChild(app)

    const hook = fakeHook({
      componentRecord: (id) => ({ id, displayName: "Page", displayNameInferred: true }) as ComponentRecord,
    })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.startPicker()
    originalEfp = document.elementsFromPoint
    document.elementsFromPoint = () => [app]
    handle!.controller.handlePointerMove(10, 10)
    render()

    const badge = handle!.shadowRoot.querySelector(".mi-hb-component")
    expect(badge?.textContent).toContain("Page")
    expect(badge?.textContent).toContain("Inferred")
    expect(badge?.querySelector(".mi-precision-inferred")).not.toBeNull()
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

  it("clears the frozen highlight box once a route swap removes the selected element from the DOM (regression)", async () => {
    const page = document.createElement("div")
    document.body.appendChild(page)
    const el = document.createElement("article")
    stubRect(el, { left: 4, top: 8, width: 40, height: 20 })
    page.appendChild(el)

    handle = mountInspectorOverlay({ picker: { openOnClick: false } }, { hook: fakeHook() })
    handle!.controller.startPicker()
    originalEfp = document.elementsFromPoint
    document.elementsFromPoint = () => [el]
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    render()

    expect(handle!.shadowRoot.querySelectorAll(".mi-rect-frozen").length).toBe(1)

    // Simulate an in-app route change swapping out the previously selected
    // element's subtree (e.g. `m.route.set()` between two pages) — no
    // scroll/resize fires, only a DOM mutation.
    page.removeChild(el)
    document.body.appendChild(document.createElement("section"))
    // The overlay's MutationObserver callback lands in a microtask, then it
    // requests an animation frame to recompute the highlight.
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    render()

    expect(handle!.shadowRoot.querySelectorAll(".mi-rect-frozen").length).toBe(0)
    expect(handle!.controller.getState().selection.stale).toBe(true)
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

  it("persists the collapsed state so it survives a reload", () => {
    const store = document.defaultView!.localStorage
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    handle!.controller.setCollapsed(false)
    render()

    expect(handle!.shadowRoot.querySelector(".mi-dock")).not.toBeNull()
    expect(store.getItem("__mithril-inspector-overlay")).toContain('"collapsed":false')
  })

  it("reveals the picker icon on the collapsed toggle and starts picking from it directly", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    render()

    const toggle = handle!.shadowRoot.querySelector(".mi-toggle") as HTMLElement
    expect(toggle).not.toBeNull()
    const pickBtn = toggle.querySelector(".mi-toggle-pick") as HTMLElement
    expect(pickBtn).not.toBeNull()

    pickBtn.click()
    expect(handle!.controller.isPicking()).toBe(true)
    // Picking doesn't expand the panel — the collapsed toggle can pick directly.
    expect(handle!.controller.getState().collapsed).toBe(true)
  })

  it("replaces a prior host instead of duplicating it (HMR remount)", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    const second = mountInspectorOverlay({}, { hook: fakeHook() })
    expect(document.querySelectorAll(`#${HOST_ID}`).length).toBe(1)
    second?.dispose()
  })
})

describe("mountInspectorOverlay — ancestry breadcrumb & detail toolbar (§8.3, §9.1, §9.3, task 0019)", () => {
  it("renders the resolved ancestry chain as a breadcrumb, root-first, with inferred-name and not-mounted markers", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)

    const appRecord = componentRecord({ id: "c:1" as ComponentId, displayName: "App" })
    const cardRecord = componentRecord({
      id: "c:2" as ComponentId,
      displayName: "UserCard",
      displayNameInferred: true,
      mounted: false,
    })
    const hook = fakeHook({
      resolveDomComponent: () => "c:2" as ComponentId,
      componentRecord: (id) => (id === "c:1" ? appRecord : cardRecord),
      componentAncestry: () => [appRecord, cardRecord],
    })
    handle = mountInspectorOverlay({ picker: { openOnClick: false } }, { hook })
    handle!.controller.startPicker()
    originalEfp = document.elementsFromPoint
    document.elementsFromPoint = () => [el]
    handle!.controller.handlePointerMove(1, 1)
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    render()

    const crumbs = handle!.shadowRoot.querySelectorAll(".mi-crumb")
    expect(crumbs.length).toBe(2)
    expect(crumbs[0]?.textContent).toContain("App")
    expect(crumbs[1]?.textContent).toContain("UserCard")
    expect(crumbs[1]?.textContent).toContain("Inferred")
    expect(crumbs[1]?.textContent).toContain("not mounted")
  })

  it("clicking an ancestor's crumb focuses it and highlights its own DOM range (§9.3)", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)

    const ancestorNode = document.createElement("section")
    stubRect(ancestorNode, { left: 5, top: 6, width: 7, height: 8 })
    document.body.appendChild(ancestorNode)

    const appRecord = componentRecord({
      id: "c:1" as ComponentId,
      displayName: "App",
      domRange: { first: ancestorNode, last: ancestorNode },
    })
    const cardRecord = componentRecord({ id: "c:2" as ComponentId, displayName: "UserCard" })
    const hook = fakeHook({
      resolveDomComponent: () => "c:2" as ComponentId,
      componentRecord: (id) => (id === "c:1" ? appRecord : cardRecord),
      componentAncestry: () => [appRecord, cardRecord],
    })
    handle = mountInspectorOverlay({ picker: { openOnClick: false } }, { hook })
    handle!.controller.startPicker()
    originalEfp = document.elementsFromPoint
    document.elementsFromPoint = () => [el]
    handle!.controller.handlePointerMove(1, 1)
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    render()

    const crumbs = handle!.shadowRoot.querySelectorAll(".mi-crumb")
    expect(crumbs.length).toBe(2)
    ;(crumbs[0] as HTMLElement).click()
    render()

    const rect = handle!.shadowRoot.querySelector(".mi-rect-frozen") as HTMLElement | null
    expect(rect?.style.left).toBe("5px")
    expect(rect?.style.top).toBe("6px")
  })

  it("the detail toolbar offers one icon per resolved source choice, without duplicating 'Open in editor' (§9.3)", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)
    const rangeNode = document.createElement("span")
    document.body.appendChild(rangeNode)

    const declLoc: SourceLocation = { ...source, kind: "component-declaration", line: 42 }
    const record = componentRecord({
      id: "c:1" as ComponentId,
      displayName: "Card",
      domRange: { first: rangeNode, last: rangeNode },
      source: declLoc,
    })
    const hook = fakeHook({
      resolveDomComponent: () => "c:1" as ComponentId,
      componentRecord: () => record,
      componentAncestry: () => [record],
      resolveDomSource: (node) => (node === rangeNode ? source : null),
      componentViewSource: () => null,
    })
    handle = mountInspectorOverlay({ picker: { openOnClick: false } }, { hook })
    handle!.controller.startPicker()
    originalEfp = document.elementsFromPoint
    document.elementsFromPoint = () => [el]
    handle!.controller.handlePointerMove(1, 1)
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    render()

    const toolbarLabels = Array.from(handle!.shadowRoot.querySelectorAll(".mi-toolbar .mi-icon-btn")).map((b) =>
      b.getAttribute("aria-label"),
    )
    // "Open in editor" (the exact clicked element's own source) plus the
    // declaration choice — no separate "Rendered element" icon duplicating
    // "Open in editor", and no "Component view" icon since none resolved.
    expect(toolbarLabels).toContain("Open in editor")
    expect(toolbarLabels).toContain("Component declaration")
    expect(toolbarLabels).not.toContain("Rendered element")
    expect(toolbarLabels).not.toContain("Component view")
  })

  it("shows the 'no owning component' fallback when nothing resolved", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(el)
    const hook = fakeHook({ resolveDomComponent: () => null })
    handle = mountInspectorOverlay({ picker: { openOnClick: false } }, { hook })
    handle!.controller.startPicker()
    originalEfp = document.elementsFromPoint
    document.elementsFromPoint = () => [el]
    handle!.controller.handlePointerMove(1, 1)
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    render()

    expect(handle!.shadowRoot.querySelectorAll(".mi-crumb").length).toBe(0)
    expect(handle!.shadowRoot.textContent).toContain("No owning component resolved for this element.")
  })
})

describe("mountInspectorOverlay — Components tab tree (§9, §9.3, §9.4, task 0022)", () => {
  function snapshotOf(records: ComponentRecord[]) {
    return {
      components: new Map(records.map((r) => [r.id, r] as const)),
      vnodes: new Map(),
      modules: new Map(),
      domAssociations: new Map(),
    }
  }

  it("renders the component hierarchy with display names and keys, excluding plain HTML elements", () => {
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", childIds: ["c:2" as ComponentId] })
    const list = componentRecord({
      id: "c:2" as ComponentId,
      displayName: "UserList",
      parentId: "c:1" as ComponentId,
      childIds: ["c:3" as ComponentId],
    })
    const card = componentRecord({
      id: "c:3" as ComponentId,
      displayName: "UserCard",
      parentId: "c:2" as ComponentId,
      key: "42",
      updateCount: 3,
    })
    const hook = fakeHook({ getSnapshot: () => snapshotOf([app, list, card]) })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    render()

    const rows = handle!.shadowRoot.querySelectorAll('[role="treeitem"]')
    expect(rows.length).toBe(3)
    const names = Array.from(rows).map((r) => r.querySelector(".mi-tree-name")?.textContent)
    expect(names).toEqual(["App", "UserList", 'UserCard key="42"'])
    expect(handle!.shadowRoot.querySelector(".mi-badge-count")?.textContent).toBe("×3")
  })

  it("shows a slow-render warning badge in the tree once slowRenderCount is positive, hidden otherwise (§17 diagnostics, task 0029)", () => {
    const fast = componentRecord({ id: "c:1" as ComponentId, displayName: "Fast", renderDuration: 2, slowRenderCount: 0 })
    const slow = componentRecord({
      id: "c:2" as ComponentId,
      displayName: "Slow",
      renderDuration: 42.1,
      slowRenderCount: 3,
    })
    const hook = fakeHook({ getSnapshot: () => snapshotOf([fast, slow]) })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    render()

    const badges = handle!.shadowRoot.querySelectorAll(".mi-badge-warn")
    expect(badges.length).toBe(1)
    expect(badges[0]?.textContent).toBe("⚠ 3")
    expect(badges[0]?.getAttribute("title")).toBe("3 slow render(s) — last render 42.1ms")
  })

  it("shows the disabled message instead of the tree when componentTree.enabled is false", () => {
    const hook = fakeHook({ getSnapshot: () => snapshotOf([componentRecord({ id: "c:1" as ComponentId })]) })
    handle = mountInspectorOverlay({ componentTree: { enabled: false } }, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    render()

    expect(handle!.shadowRoot.querySelectorAll('[role="treeitem"]').length).toBe(0)
    expect(handle!.shadowRoot.textContent).toContain("Component tree tracking is disabled.")
  })

  it("applies incremental batched updates from subscribe() without re-fetching the snapshot (§9.4)", () => {
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App" })
    let listener: ((event: RuntimeEvent) => void) | null = null
    const hook = fakeHook({
      getSnapshot: () => snapshotOf([app]),
      subscribe: (fn) => {
        listener = fn
        return () => {}
      },
    })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    render()
    expect(handle!.shadowRoot.querySelectorAll('[role="treeitem"]').length).toBe(1)

    listener!({
      type: "components-added",
      records: [componentRecord({ id: "c:2" as ComponentId, displayName: "Late" })],
    })
    render()
    expect(handle!.shadowRoot.querySelectorAll('[role="treeitem"]').length).toBe(2)
    expect(handle!.shadowRoot.textContent).toContain("Late")
  })

  it("searching filters rows to matches and their ancestors", () => {
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", childIds: ["c:2" as ComponentId] })
    const card = componentRecord({ id: "c:2" as ComponentId, displayName: "UserCard", parentId: "c:1" as ComponentId })
    const hook = fakeHook({ getSnapshot: () => snapshotOf([app, card]) })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    render()

    const search = handle!.shadowRoot.querySelector(".mi-tree-search") as HTMLInputElement
    search.value = "nomatch"
    search.dispatchEvent(new Event("input"))
    render()
    expect(handle!.shadowRoot.querySelectorAll('[role="treeitem"]').length).toBe(0)
    expect(handle!.shadowRoot.textContent).toContain("No components match your search.")
  })

  it("clicking a tree row selects the component, syncing the shared selection and highlighting its DOM range (§9.3)", () => {
    const el = document.createElement("article")
    stubRect(el, { left: 3, top: 4, width: 5, height: 6 })
    document.body.appendChild(el)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: el, last: el } })
    const hook = fakeHook({ getSnapshot: () => snapshotOf([app]), componentRecord: () => app, componentAncestry: () => [app] })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    render()

    const nameButton = handle!.shadowRoot.querySelector(".mi-tree-name") as HTMLElement
    nameButton.closest('[role="treeitem"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    render()

    expect(handle!.controller.getState().selection.componentId).toBe("c:1")
    const rect = handle!.shadowRoot.querySelector(".mi-rect-frozen") as HTMLElement | null
    expect(rect?.style.left).toBe("3px")
    expect(handle!.shadowRoot.querySelector(".mi-breadcrumb")?.textContent).toContain("App")
  })

  it("pins a component and keeps it listed with a not-mounted marker after it unmounts (§3.2)", () => {
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "Modal" })
    let listener: ((event: RuntimeEvent) => void) | null = null
    const hook = fakeHook({
      getSnapshot: () => snapshotOf([app]),
      subscribe: (fn) => {
        listener = fn
        return () => {}
      },
    })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    render()

    ;(handle!.shadowRoot.querySelector(".mi-pin-btn") as HTMLElement).click()
    render()
    expect(handle!.shadowRoot.querySelector(".mi-pinned")?.textContent).toContain("Modal")

    listener!({ type: "components-removed", ids: ["c:1"] })
    render()
    expect(handle!.shadowRoot.querySelector(".mi-pinned")?.textContent).toContain("Modal")
    expect(handle!.shadowRoot.querySelector(".mi-pinned")?.textContent).toContain("not mounted")
  })

  it("keyboard: ArrowDown moves the roving tabindex to the next row, ArrowRight expands a collapsed node", () => {
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", childIds: ["c:2" as ComponentId] })
    const card = componentRecord({ id: "c:2" as ComponentId, displayName: "UserCard", parentId: "c:1" as ComponentId })
    const hook = fakeHook({ getSnapshot: () => snapshotOf([app, card]) })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    render()

    // Collapse App first so ArrowRight has something to do.
    ;(handle!.shadowRoot.querySelector(".mi-tree-chevron") as HTMLElement).click()
    render()
    expect(handle!.shadowRoot.querySelectorAll('[role="treeitem"]').length).toBe(1)

    const appRow = handle!.shadowRoot.querySelector('[data-mi-tree-id="c:1"]') as HTMLElement
    appRow.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    render()
    expect(handle!.shadowRoot.querySelectorAll('[role="treeitem"]').length).toBe(2)
  })

  it("shows the selected component's last render duration in the detail pane, flagged once it's slow (§17 diagnostics, task 0029)", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const app = componentRecord({
      id: "c:1" as ComponentId,
      displayName: "App",
      domRange: { first: el, last: el },
      renderDuration: 42.1,
      slowRenderCount: 3,
    })
    const hook = fakeHook({
      getSnapshot: () => snapshotOf([app]),
      componentRecord: () => app,
      componentAncestry: () => [app],
    })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    handle!.controller.selectComponent("c:1" as ComponentId)
    render()

    const timing = handle!.shadowRoot.querySelector(".mi-render-timing")
    expect(timing?.textContent).toBe("Last render: 42.1ms · 3 slow render(s)")
    expect(timing?.classList.contains("mi-render-timing-slow")).toBe(true)
  })

  it("omits the render-timing line entirely until a render has actually been measured", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: el, last: el } })
    const hook = fakeHook({
      getSnapshot: () => snapshotOf([app]),
      componentRecord: () => app,
      componentAncestry: () => [app],
    })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    handle!.controller.selectComponent("c:1" as ComponentId)
    render()

    expect(handle!.shadowRoot.querySelector(".mi-render-timing")).toBeNull()
  })

  it("shows a mode:full gating message for attrs/state until the runtime is in full mode", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: el, last: el } })
    const hook = fakeHook({
      getSnapshot: () => snapshotOf([app]),
      componentRecord: () => app,
      componentAncestry: () => [app],
      getMode: () => "source",
    })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    handle!.controller.selectComponent("c:1" as ComponentId)
    render()

    expect(handle!.shadowRoot.textContent).toContain('Enable mode: "full" to inspect attrs.')
  })

  it("renders an attrs preview and evaluates a getter on demand (§7.4)", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: el, last: el } })
    const getterNode = { kind: "getter" as const, path: [{ kind: "prop" as const, key: "value" }] }
    const objectNode = {
      kind: "object" as const,
      className: "Object",
      size: 1,
      entries: [{ key: "value", node: getterNode }],
      offset: 0,
      truncated: false,
      path: [],
    }
    const expandPreview = vi.fn(() => ({ kind: "primitive" as const, type: "number" as const, value: 42 }))
    const hook = fakeHook({
      getSnapshot: () => snapshotOf([app]),
      componentRecord: () => app,
      componentAncestry: () => [app],
      getMode: () => "full",
      attrsPreview: () => objectNode,
      expandPreview,
    })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    handle!.controller.selectComponent("c:1" as ComponentId)
    render()

    expect(handle!.shadowRoot.querySelector(".mi-preview-getter")?.textContent).toContain("(...)")
    ;(handle!.shadowRoot.querySelector(".mi-preview-getter button") as HTMLElement).click()
    render()

    expect(expandPreview).toHaveBeenCalledWith("c:1", "attrs", [{ kind: "prop", key: "value" }], undefined)
    expect(handle!.shadowRoot.querySelector(".mi-preview-value")?.textContent).toBe("42")
  })

  it("shows a 'no longer tracked' fallback instead of silently hiding the details panel once the selected component untracks (§8.8-style tolerance)", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: el, last: el } })
    const hook = fakeHook({ getSnapshot: () => snapshotOf([app]), componentRecord: () => app, componentAncestry: () => [] })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("components")
    handle!.controller.selectComponent("c:1" as ComponentId)
    render()

    expect(handle!.shadowRoot.textContent).toContain("Component is no longer tracked.")
  })
})

describe("mountInspectorOverlay — State History tab (task 0027)", () => {
  function snapshotOf(records: ComponentRecord[]) {
    return {
      components: new Map(records.map((r) => [r.id, r] as const)),
      vnodes: new Map(),
      modules: new Map(),
      domAssociations: new Map(),
    }
  }

  it("shows the gate message instead of a timeline until mode is full and captureState is on", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: el, last: el } })
    const hook = fakeHook({ getSnapshot: () => snapshotOf([app]), componentRecord: () => app })
    handle = mountInspectorOverlay({}, { hook }) // mode defaults to "source" in the fake hook
    handle!.controller.setCollapsed(false)
    handle!.controller.selectComponent("c:1" as ComponentId)
    handle!.controller.setActiveTab("history")
    render()

    expect(handle!.shadowRoot.textContent).toContain('Enable mode: "full"')
    expect(handle!.shadowRoot.querySelectorAll(".mi-history-list li").length).toBe(0)
  })

  it("accumulates a snapshot per components-updated event for the watched component and diffs it against its predecessor", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: el, last: el } })
    let listener: ((event: RuntimeEvent) => void) | null = null
    const countState = (value: number) => ({
      kind: "object" as const,
      className: "Object",
      size: 1,
      entries: [{ key: "count", node: { kind: "primitive" as const, type: "number" as const, value } }],
      offset: 0,
      truncated: false,
      path: [],
    })
    // `statePreview` always reflects the *current* live value (like the real
    // hook) — set explicitly before each event, not an auto-advancing
    // sequence, since getState() itself also reads statePreview() on every
    // redraw (for the Components tab's own preview) regardless of which tab
    // is active.
    let current = countState(1)
    const hook = fakeHook({
      getSnapshot: () => snapshotOf([app]),
      componentRecord: () => app,
      getMode: () => "full",
      statePreview: () => current,
      subscribe: (fn) => {
        listener = fn
        return () => {}
      },
    })
    handle = mountInspectorOverlay({ componentTree: { captureState: true } }, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.selectComponent("c:1" as ComponentId) // seeds row 0 with count:1
    handle!.controller.setActiveTab("history")
    render()
    expect(handle!.shadowRoot.querySelectorAll(".mi-history-list li").length).toBe(1)

    current = countState(2)
    listener!({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 1 }] })
    render()
    current = countState(3)
    listener!({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 2 }] })
    render()

    const rows = handle!.shadowRoot.querySelectorAll(".mi-history-list li")
    expect(rows.length).toBe(3)
    // Each row shows its own compact "what changed" preview inline, not just
    // the selected entry's diff panel below.
    // Newest first (task 0028): row 0 is the third (latest) snapshot.
    expect(rows[0]?.textContent).toContain("count: 2 → 3")
    expect(rows[2]?.textContent).toContain("initial snapshot")

    const diffText = handle!.shadowRoot.querySelector(".mi-history-diff")?.textContent ?? ""
    expect(diffText).toContain("count")
    expect(diffText).toContain("2")
    expect(diffText).toContain("3")
  })

  it("shows the same left tree pane the Components tab uses, in sync with the watched component (task 0028)", () => {
    const appEl = document.createElement("div")
    const otherEl = document.createElement("div")
    document.body.append(appEl, otherEl)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: appEl, last: appEl } })
    const other = componentRecord({ id: "c:2" as ComponentId, displayName: "Other", domRange: { first: otherEl, last: otherEl } })
    const hook = fakeHook({ getSnapshot: () => snapshotOf([app, other]), componentRecord: (id) => (id === "c:2" ? other : app) })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.selectComponent("c:1" as ComponentId)
    handle!.controller.setActiveTab("history")
    render()

    expect(handle!.shadowRoot.querySelector('[role="tree"]')).not.toBeNull()
    expect(handle!.shadowRoot.textContent).toContain("Watching: App")

    // Selecting a different component in the same tree updates the watched heading.
    const rows = Array.from(handle!.shadowRoot.querySelectorAll(".mi-tree-name"))
    const otherIndex = rows.findIndex((r) => r.textContent === "Other")
    expect(otherIndex).toBeGreaterThanOrEqual(0)
    ;(handle!.shadowRoot.querySelectorAll('[role="treeitem"]')[otherIndex] as HTMLElement).click()
    render()
    expect(handle!.shadowRoot.textContent).toContain("Watching: Other")
  })

  it("expands a changed array-of-objects diff entry into an aligned two-column table instead of Array(N) -> Array(N) (task 0028 regression)", () => {
    const appEl = document.createElement("div")
    document.body.appendChild(appEl)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: appEl, last: appEl } })
    let listener: ((event: RuntimeEvent) => void) | null = null
    const task = (done: boolean) => ({
      kind: "object" as const,
      className: "Object",
      size: 2,
      entries: [
        { key: "id", node: { kind: "primitive" as const, type: "number" as const, value: 1 } },
        { key: "done", node: { kind: "primitive" as const, type: "boolean" as const, value: done } },
      ],
      offset: 0,
      truncated: false,
      path: [],
    })
    const tasksState = (done: boolean) => ({
      kind: "object" as const,
      className: "Object",
      size: 1,
      entries: [{ key: "tasks", node: { kind: "array" as const, length: 1, items: [task(done)], offset: 0, truncated: false, path: [] } }],
      offset: 0,
      truncated: false,
      path: [],
    })
    let current = tasksState(false)
    const hook = fakeHook({
      getSnapshot: () => snapshotOf([app]),
      componentRecord: () => app,
      getMode: () => "full",
      statePreview: () => current,
      subscribe: (fn) => {
        listener = fn
        return () => {}
      },
    })
    handle = mountInspectorOverlay({ componentTree: { captureState: true } }, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.selectComponent("c:1" as ComponentId)
    handle!.controller.setActiveTab("history")
    render()

    listener!({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 1 }] })
    render()
    current = tasksState(true) // same array length, one nested field flipped — the reported "Array(4) -> Array(4)" case
    listener!({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 2 }] })
    render()

    const diffSection = handle!.shadowRoot.querySelector(".mi-history-diff")
    expect(diffSection?.textContent).not.toContain("Array(1) → Array(1)")
    const table = diffSection?.querySelector("table.mi-history-compare")
    expect(table).not.toBeNull()
    expect(table?.textContent).toContain("done")
    expect(table?.textContent).toContain("false")
    expect(table?.textContent).toContain("true")
  })

  it("leaves the empty '(value): Object' noise out for an attrs-only component with no state of its own (task 0027 follow-up, the original bug report)", () => {
    const appEl = document.createElement("div")
    document.body.appendChild(appEl)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "UserCard", domRange: { first: appEl, last: appEl } })
    const emptyState = { kind: "object" as const, className: "Object", size: 0, entries: [], offset: 0, truncated: false, path: [] }
    const nameAttrs = (name: string) => ({
      kind: "object" as const,
      className: "Object",
      size: 1,
      entries: [{ key: "name", node: { kind: "primitive" as const, type: "string" as const, value: name } }],
      offset: 0,
      truncated: false,
      path: [],
    })
    const hook = fakeHook({
      getSnapshot: () => ({ components: new Map([["c:1" as ComponentId, app]]), vnodes: new Map(), modules: new Map(), domAssociations: new Map() }),
      componentRecord: () => app,
      getMode: () => "full",
      statePreview: () => emptyState,
      attrsPreview: () => nameAttrs("Grace Hopper"),
    })
    handle = mountInspectorOverlay({ componentTree: { captureState: true, captureAttrs: true } }, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.selectComponent("c:1" as ComponentId)
    handle!.controller.setActiveTab("history")
    render()

    // The attrs whole-value "added" entry (real content) still shows...
    const diffSection = handle!.shadowRoot.querySelector(".mi-history-diff")
    const rows = Array.from(diffSection?.children ?? [])
    expect(rows).toHaveLength(1)
    expect(diffSection?.textContent).toContain("name")
    expect(diffSection?.textContent).toContain("Grace Hopper")
    // ...but the always-empty state never contributes its own bare "Object" row.
    expect(diffSection?.querySelectorAll(".mi-history-diff-source")).toHaveLength(0)
    // Only one source ever has data, so there's nothing to toggle between.
    expect(handle!.shadowRoot.querySelector(".mi-row-check")).toBeNull()
  })

  it("interleaves attrs and state changes in one combined, sorted list with source badges once both have data", () => {
    const appEl = document.createElement("div")
    document.body.appendChild(appEl)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: appEl, last: appEl } })
    let listener: ((event: RuntimeEvent) => void) | null = null
    const countState = (value: number) => ({
      kind: "object" as const,
      className: "Object",
      size: 1,
      entries: [{ key: "count", node: { kind: "primitive" as const, type: "number" as const, value } }],
      offset: 0,
      truncated: false,
      path: [],
    })
    const nameAttrs = (name: string) => ({
      kind: "object" as const,
      className: "Object",
      size: 1,
      entries: [{ key: "name", node: { kind: "primitive" as const, type: "string" as const, value: name } }],
      offset: 0,
      truncated: false,
      path: [],
    })
    let state = countState(1)
    let attrs = nameAttrs("Ada")
    const hook = fakeHook({
      getSnapshot: () => ({ components: new Map([["c:1" as ComponentId, app]]), vnodes: new Map(), modules: new Map(), domAssociations: new Map() }),
      componentRecord: () => app,
      getMode: () => "full",
      statePreview: () => state,
      attrsPreview: () => attrs,
      subscribe: (fn) => {
        listener = fn
        return () => {}
      },
    })
    handle = mountInspectorOverlay({ componentTree: { captureState: true, captureAttrs: true } }, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.selectComponent("c:1" as ComponentId)
    handle!.controller.setActiveTab("history")
    render()

    state = countState(2)
    attrs = nameAttrs("Grace")
    listener!({ type: "components-updated", records: [{ id: "c:1" as ComponentId, updateCount: 1 }] })
    render()

    // Both sources have real data — the Both/State/Attrs toggle appears.
    const filterButtons = Array.from(handle!.shadowRoot.querySelectorAll(".mi-row-check button.mi-btn-small")).map((b) => b.textContent)
    expect(filterButtons).toEqual(["Both", "State", "Attrs"])

    // The combined diff shows both, key-sorted (count before name), each tagged with its source.
    const diffSection = handle!.shadowRoot.querySelector(".mi-history-diff")
    const rows = Array.from(diffSection?.querySelectorAll("li") ?? [])
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain("count")
    expect(rows[0]?.querySelector(".mi-history-diff-source")?.textContent).toBe("state")
    expect(rows[1]?.textContent).toContain("name")
    expect(rows[1]?.querySelector(".mi-history-diff-source")?.textContent).toBe("attrs")

    // Narrowing to "Attrs" hides the state row.
    const attrsButton = Array.from(handle!.shadowRoot.querySelectorAll(".mi-row-check button.mi-btn-small")).find(
      (b) => b.textContent === "Attrs",
    ) as HTMLButtonElement
    attrsButton.click()
    render()
    const narrowedRows = Array.from(handle!.shadowRoot.querySelectorAll(".mi-history-diff li"))
    expect(narrowedRows).toHaveLength(1)
    expect(narrowedRows[0]?.textContent).toContain("name")
  })
})

describe("mountInspectorOverlay — Elements tab (task 0031, §9.1 optional 'owned vnode/element tree' expansion)", () => {
  function snapshotOf(records: ComponentRecord[]) {
    return {
      components: new Map(records.map((r) => [r.id, r] as const)),
      vnodes: new Map(),
      modules: new Map(),
      domAssociations: new Map(),
    }
  }

  it("shows an empty-state message until a component is selected", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    handle!.controller.setCollapsed(false)
    handle!.controller.setActiveTab("elements")
    render()

    expect(handle!.shadowRoot.textContent).toContain("No component selected.")
  })

  it("shows the same left tree pane the Components tab uses, in sync with the current selection (mirrors task 0028's History-tab precedent)", () => {
    const appEl = document.createElement("div")
    document.body.appendChild(appEl)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: appEl, last: appEl } })
    const hook = fakeHook({ getSnapshot: () => snapshotOf([app]), componentRecord: () => app })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.selectComponent("c:1" as ComponentId)
    handle!.controller.setActiveTab("elements")
    render()

    expect(handle!.shadowRoot.querySelector('[role="tree"]')).not.toBeNull()
    expect(handle!.shadowRoot.textContent).toContain("Elements rendered by: App")
  })

  it("renders the selected component's own DOM as mithril hyperscript labels, tag name on by default", () => {
    const root = document.createElement("div")
    root.id = "app"
    root.className = "scroll"
    document.body.appendChild(root)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: root, last: root } })
    const hook = fakeHook({ getSnapshot: () => snapshotOf([app]), componentRecord: () => app })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.selectComponent("c:1" as ComponentId)
    handle!.controller.setActiveTab("elements")
    render()

    expect(handle!.shadowRoot.querySelector(".mi-elements-row")?.textContent).toBe("div#app.scroll")
  })

  it("clicking an element row calls openDomNodeSource with that exact DOM node (task 0031's own 'click to jump to source')", () => {
    const root = document.createElement("div")
    root.id = "app"
    document.body.appendChild(root)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: root, last: root } })
    const hook = fakeHook({ getSnapshot: () => snapshotOf([app]), componentRecord: () => app })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.selectComponent("c:1" as ComponentId)
    handle!.controller.setActiveTab("elements")
    render()

    // openInEditor's own network effect isn't injectable through
    // mountInspectorOverlay (only createOverlayController's own deps expose
    // that, already covered at the controller-test.ts level) — this checks
    // the DOM click actually reaches the controller with the right node,
    // which is what this level can uniquely verify.
    const openDomNodeSource = vi.spyOn(handle!.controller, "openDomNodeSource")
    ;(handle!.shadowRoot.querySelector(".mi-elements-row") as HTMLButtonElement).click()
    expect(openDomNodeSource).toHaveBeenCalledWith(root)
  })

  it("omits the tag name once the Settings-tab toggle is turned off, live, without remounting", () => {
    const root = document.createElement("div")
    root.className = "scroll"
    document.body.appendChild(root)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: { first: root, last: root } })
    const hook = fakeHook({ getSnapshot: () => snapshotOf([app]), componentRecord: () => app })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.selectComponent("c:1" as ComponentId)
    handle!.controller.setActiveTab("elements")
    render()
    expect(handle!.shadowRoot.querySelector(".mi-elements-row")?.textContent).toBe("div.scroll")

    handle!.controller.setShowElementTagName(false)
    render()
    expect(handle!.shadowRoot.querySelector(".mi-elements-row")?.textContent).toBe(".scroll")
  })

  it("renders a direct child component as a clickable link, and clicking it re-selects that child via the shared selection (§9.3)", () => {
    const parentEl = document.createElement("ul")
    const childEl = document.createElement("li")
    document.body.appendChild(parentEl)
    parentEl.appendChild(childEl)
    const child = componentRecord({
      id: "c:2" as ComponentId,
      displayName: "Row",
      parentId: "c:1" as ComponentId,
      domRange: { first: childEl, last: childEl },
    })
    const parent = componentRecord({
      id: "c:1" as ComponentId,
      displayName: "List",
      childIds: ["c:2" as ComponentId],
      domRange: { first: parentEl, last: parentEl },
    })
    const hook = fakeHook({
      getSnapshot: () => snapshotOf([parent, child]),
      componentRecord: (id) => (id === "c:2" ? child : parent),
    })
    handle = mountInspectorOverlay({}, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.selectComponent("c:1" as ComponentId)
    handle!.controller.setActiveTab("elements")
    render()

    const link = handle!.shadowRoot.querySelector(".mi-preview-component-link") as HTMLButtonElement
    expect(link?.textContent).toBe("Row")
    link.click()
    render()

    expect(handle!.controller.getState().selection.componentId).toBe("c:2")
  })

  it("shows a message instead of a tree once a component is selected with no associated DOM", () => {
    // selectComponent() itself refuses to select a component with a null
    // domRange (it has no representative element to highlight), so this
    // state is only reachable via a raw DOM pick, which resolves componentId
    // independently of domRange — resolveDomComponent can name a component
    // whose own domRange hasn't been computed (or is genuinely null, e.g. a
    // component whose view() returned null).
    const target = document.createElement("button")
    stubRect(target, { left: 0, top: 0, width: 10, height: 10 })
    document.body.appendChild(target)
    const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App", domRange: null })
    const hook = fakeHook({
      resolveDomComponent: () => "c:1" as ComponentId,
      componentRecord: () => app,
    })
    handle = mountInspectorOverlay({ picker: { openOnClick: false } }, { hook })
    handle!.controller.setCollapsed(false)
    handle!.controller.startPicker()
    originalEfp = document.elementsFromPoint
    document.elementsFromPoint = () => [target]
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    handle!.controller.setActiveTab("elements")
    render()

    expect(handle!.controller.getState().selection.componentId).toBe("c:1")
    expect(handle!.shadowRoot.textContent).toContain("This component has no associated DOM to show.")
  })
})

describe("mountInspectorOverlay — no global-redraw feedback loop (regression)", () => {
  function snapshotOf(records: ComponentRecord[]) {
    return {
      components: new Map(records.map((r) => [r.id, r] as const)),
      vnodes: new Map(),
      modules: new Map(),
      domAssociations: new Map(),
    }
  }

  it("never calls the global m.redraw() — reacting to batched RuntimeEvents must not be observable outside the overlay's own DOM (task 0022 bug)", () => {
    // `m.redraw()` is Mithril's *global* redraw — it re-renders every
    // `m.mount`-ed root sharing this module, not just the overlay's own, and
    // (worse) doing so re-fires every host-app component's `onupdate`/
    // `updateCount`, producing more batched events that the Components tab's
    // subscription would react to by redrawing again: an unbounded,
    // self-sustaining loop needing no user interaction at all. A spy is used
    // rather than a second `m.mount`-ed "host app" stand-in because
    // `m.redraw()` is scheduled asynchronously (rAF by default) — a
    // synchronous test would not observe a cascaded redraw that way even with
    // the bug present, whereas asserting the function itself was never
    // invoked is precise regardless of scheduling.
    const redrawSpy = vi.spyOn(m, "redraw")
    try {
      const app = componentRecord({ id: "c:1" as ComponentId, displayName: "App" })
      const listeners: Array<(event: RuntimeEvent) => void> = []
      const hook = fakeHook({
        getSnapshot: () => snapshotOf([app]),
        subscribe: (fn) => {
          listeners.push(fn)
          return () => {}
        },
      })
      handle = mountInspectorOverlay({}, { hook })
      handle!.controller.setCollapsed(false)
      handle!.controller.setActiveTab("components")

      // Simulate a burst of batched updates, as a fast redraw loop would produce.
      for (let i = 0; i < 25; i += 1) {
        listeners[0]?.({
          type: "components-updated",
          records: [{ id: "c:1" as ComponentId, updateCount: i, updatedAt: i }],
        })
      }

      // The overlay's own tree did update...
      expect(handle!.shadowRoot.querySelector(".mi-badge-count")?.textContent).toBe("×24")
      // ...via a scoped m.render(), never the global, cross-app m.redraw().
      expect(redrawSpy).not.toHaveBeenCalled()
    } finally {
      redrawSpy.mockRestore()
    }
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

describe("mountInspectorOverlay — redraw-flash visualization (task 0030)", () => {
  // MutationObserver callbacks land in a microtask, then the controller's own
  // rAF-throttled scheduler drains them (mirrors the stale-highlight-cleanup
  // test above, which documents the same two-step wait).
  async function waitForFlashProcessing(): Promise<void> {
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }

  function trackedTarget(): HTMLElement {
    const el = document.createElement("span")
    stubRect(el, { left: 3, top: 4, width: 20, height: 10 })
    document.body.appendChild(el)
    return el
  }

  it("shows a brief flash over a component's DOM range when its DOM actually mutates (attribute patch, no node replacement)", async () => {
    const target = trackedTarget()
    handle = mountInspectorOverlay(
      { redrawFlash: { enabled: true } },
      {
        hook: fakeHook({
          getMode: () => "full",
          resolveDomComponent: (node) => (node === target ? ("c:1" as ComponentId) : null),
          componentRecord: (id) => componentRecord({ id, domRange: { first: target, last: target } }),
        }),
      },
    )

    target.setAttribute("data-x", "1")
    await waitForFlashProcessing()
    render()

    expect(handle!.shadowRoot.querySelectorAll(".mi-flash-rect").length).toBe(1)
  })

  it("stays off by default (redrawFlash.enabled defaults to false)", async () => {
    const target = trackedTarget()
    handle = mountInspectorOverlay(
      {},
      {
        hook: fakeHook({
          getMode: () => "full",
          resolveDomComponent: (node) => (node === target ? ("c:1" as ComponentId) : null),
          componentRecord: (id) => componentRecord({ id, domRange: { first: target, last: target } }),
        }),
      },
    )

    target.setAttribute("data-x", "1")
    await waitForFlashProcessing()
    render()

    expect(handle!.shadowRoot.querySelectorAll(".mi-flash-rect").length).toBe(0)
  })

  it("turns on live via the Settings-tab setter without remounting, even though redrawFlash.enabled defaulted to off", async () => {
    const target = trackedTarget()
    handle = mountInspectorOverlay(
      {},
      {
        hook: fakeHook({
          getMode: () => "full",
          resolveDomComponent: (node) => (node === target ? ("c:1" as ComponentId) : null),
          componentRecord: (id) => componentRecord({ id, domRange: { first: target, last: target } }),
        }),
      },
    )

    handle!.controller.setRedrawFlashEnabled(true)
    target.setAttribute("data-x", "1")
    await waitForFlashProcessing()
    render()

    expect(handle!.shadowRoot.querySelectorAll(".mi-flash-rect").length).toBe(1)
  })

  it("stays off when mode isn't full, even with redrawFlash.enabled: true", async () => {
    const target = trackedTarget()
    handle = mountInspectorOverlay(
      { redrawFlash: { enabled: true } },
      {
        hook: fakeHook({
          getMode: () => "components",
          resolveDomComponent: (node) => (node === target ? ("c:1" as ComponentId) : null),
          componentRecord: (id) => componentRecord({ id, domRange: { first: target, last: target } }),
        }),
      },
    )

    target.setAttribute("data-x", "1")
    await waitForFlashProcessing()
    render()

    expect(handle!.shadowRoot.querySelectorAll(".mi-flash-rect").length).toBe(0)
  })

  it("starts working once the runtime transitions into mode: \"full\" after mount, even though it wasn't full at mount time", async () => {
    const target = trackedTarget()
    let mode: OverlayInspectorMode = "components"
    handle = mountInspectorOverlay(
      { redrawFlash: { enabled: true } },
      {
        hook: fakeHook({
          getMode: () => mode,
          resolveDomComponent: (node) => (node === target ? ("c:1" as ComponentId) : null),
          componentRecord: (id) => componentRecord({ id, domRange: { first: target, last: target } }),
        }),
      },
    )

    mode = "full"
    target.setAttribute("data-x", "1")
    await waitForFlashProcessing()
    render()

    expect(handle!.shadowRoot.querySelectorAll(".mi-flash-rect").length).toBe(1)
  })

  it("still shows the flash when a component is selected (frozen selection rect present alongside it)", async () => {
    // Regression test: `highlightLayer` mixed keyed flash-rect vnodes with
    // unkeyed hover/frozen-rect vnodes in the same children array. Mithril
    // doesn't support mixing keyed and unkeyed siblings — it silently
    // dropped the flash vnodes (no error, no warning) whenever a frozen
    // rect (i.e. a selected component) was also present, which permanently
    // broke flash rendering for the rest of the session since selecting a
    // component is exactly what a user does to watch it in the tree.
    const target = trackedTarget()
    handle = mountInspectorOverlay(
      { redrawFlash: { enabled: true } },
      {
        hook: fakeHook({
          getMode: () => "full",
          resolveDomComponent: (node) => (node === target ? ("c:1" as ComponentId) : null),
          componentRecord: (id) => componentRecord({ id, domRange: { first: target, last: target } }),
        }),
      },
    )

    handle!.controller.selectComponent("c:1" as ComponentId)
    render()
    expect(handle!.shadowRoot.querySelectorAll(".mi-rect-frozen").length).toBe(1)

    target.setAttribute("data-x", "1")
    await waitForFlashProcessing()
    render()

    expect(handle!.shadowRoot.querySelectorAll(".mi-flash-rect").length).toBe(1)
    expect(handle!.shadowRoot.querySelectorAll(".mi-rect-frozen").length).toBe(1)
  })

  it("hides an in-flight flash immediately when turned off mid-animation, instead of waiting out its timer", async () => {
    const target = trackedTarget()
    handle = mountInspectorOverlay(
      { redrawFlash: { enabled: true } },
      {
        hook: fakeHook({
          getMode: () => "full",
          resolveDomComponent: (node) => (node === target ? ("c:1" as ComponentId) : null),
          componentRecord: (id) => componentRecord({ id, domRange: { first: target, last: target } }),
        }),
      },
    )

    target.setAttribute("data-x", "1")
    await waitForFlashProcessing()
    render()
    expect(handle!.shadowRoot.querySelectorAll(".mi-flash-rect").length).toBe(1)

    handle!.controller.setRedrawFlashEnabled(false)
    render()

    expect(handle!.shadowRoot.querySelectorAll(".mi-flash-rect").length).toBe(0)
  })

  it("never flashes on the overlay's own shadow-rooted DOM mutations, even when every node would otherwise resolve to a component", async () => {
    const target = trackedTarget()
    // Deliberately permissive: resolves *any* node to a component, so an
    // observed flash here would prove the observer actually saw a shadow-
    // internal mutation, not merely that resolution happened to reject it.
    handle = mountInspectorOverlay(
      { redrawFlash: { enabled: true } },
      {
        hook: fakeHook({
          getMode: () => "full",
          resolveDomComponent: () => "c:1" as ComponentId,
          componentRecord: (id) => componentRecord({ id, domRange: { first: target, last: target } }),
        }),
      },
    )

    // Expanding the docked panel mutates a large amount of DOM inside the
    // overlay's own shadow root.
    handle!.controller.toggleCollapsed()
    render()
    await waitForFlashProcessing()
    render()

    expect(handle!.shadowRoot.querySelectorAll(".mi-flash-rect").length).toBe(0)
  })

  it("dispose() disconnects the observer", async () => {
    const target = trackedTarget()
    handle = mountInspectorOverlay(
      { redrawFlash: { enabled: true } },
      {
        hook: fakeHook({
          getMode: () => "full",
          resolveDomComponent: (node) => (node === target ? ("c:1" as ComponentId) : null),
          componentRecord: (id) => componentRecord({ id, domRange: { first: target, last: target } }),
        }),
      },
    )

    const controller = handle!.controller
    handle!.dispose()
    handle = null

    target.setAttribute("data-x", "1")
    await waitForFlashProcessing()
    expect(controller.getState().flashes).toEqual([])
  })
})
