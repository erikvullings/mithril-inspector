import type { ComponentId, ComponentRecord, RuntimeEvent, SourceLocation } from "@mithril-inspector/protocol"
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
  it("expands to a docked panel with a Components/Settings sidebar", () => {
    handle = mountInspectorOverlay({}, { hook: fakeHook() })
    handle!.controller.setCollapsed(false)
    render()
    const sidebarLabels = Array.from(handle!.shadowRoot.querySelectorAll(".mi-sidebar-btn")).map((b) =>
      b.getAttribute("aria-label"),
    )
    expect(sidebarLabels).toEqual(["Components", "Settings"])
    expect(handle!.shadowRoot.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it("surfaces recorded diagnostics in the Settings section (§16)", () => {
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
