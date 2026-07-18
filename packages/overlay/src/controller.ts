import type {
  ComponentId,
  ComponentRecord,
  DomRange,
  EditorRequest,
  PreviewNode,
  PreviewPath,
  SourceLocation,
} from "@mithril-inspector/protocol"

import { createDiagnostics, type Diagnostic, type DiagnosticsLog } from "./diagnostics.js"
import { describeElement, eligibleElementAt, isWithinHost } from "./element-info.js"
import { createEditorClient, type OpenInEditor } from "./editor.js"
import { rectOfElement, rectsOfDomRange, type HighlightRect } from "./highlight.js"
import type { ExpandPreviewOptions, OverlayHook } from "./hook.js"
import { describeMapping, type MappingInfo } from "./mapping.js"
import type { OverlayOptions } from "./options.js"
import {
  createPickerMachine,
  type PickerMachine,
  type PickerState,
} from "./picker.js"
import { loadOverlayState, saveOverlayState, type StorageLike } from "./persistence.js"
import { pathKey } from "./preview.js"
import { createSelectionModel, type SelectionData, type SelectionSnapshot } from "./selection.js"
import {
  isModifierHeld,
  matchesHold,
  matchesShortcut,
  parseShortcut,
  type ShortcutSpec,
} from "./shortcuts.js"
import { createComponentTreeStore, type ComponentTreeStore, type PinnedRow, type TreeRow } from "./tree.js"

export type OverlayTab = "inspector" | "components" | "settings"

/**
 * A resolved component display name plus whether it's a §9.2 fallback tier
 * (filename-derived or `"Anonymous"`) rather than an explicit or declared
 * name. The UI must distinguish the two (§2.4).
 */
export interface ComponentNameInfo {
  readonly name: string
  readonly inferred: boolean
}

/** The badge shown while hovering an instrumented element (§8.5). */
export interface HoverInfo {
  readonly element: string
  readonly componentName: ComponentNameInfo | null
  readonly mapping: MappingInfo
}

/** The three §9.3 open targets for a component, most-precise first. */
export type SourceChoiceKind = "element" | "view" | "declaration"

const SOURCE_CHOICE_LABELS: Record<SourceChoiceKind, string> = {
  element: "Rendered element",
  view: "Component view",
  declaration: "Component declaration",
}

/** One of a component's (up to three) openable source locations (§9.3). */
export interface SourceChoice {
  readonly kind: SourceChoiceKind
  readonly label: string
  readonly location: SourceLocation
  readonly mapping: MappingInfo
}

/** One entry in the ancestry list (§8.3, §9.1) — an ancestor or the selection's own component. */
export interface AncestryEntry {
  readonly id: ComponentId
  readonly name: ComponentNameInfo
  readonly mounted: boolean
  readonly choices: readonly SourceChoice[]
}

/**
 * Whether the Components tab's tree/attrs/state features are actually active
 * (§11.1 `componentTree`, §17 `mode`). `enabled` gates the tree itself;
 * `fullMode`/`captureAttrs`/`captureState` independently gate the attrs/state
 * panel — all three must hold for a preview to be fetched (task 0022).
 */
export interface ComponentTreeGating {
  readonly enabled: boolean
  readonly fullMode: boolean
  readonly captureAttrs: boolean
  readonly captureState: boolean
}

/** Everything the Components tab renders from (§9, §9.4, task 0022). */
export interface ComponentTreeViewState {
  readonly gating: ComponentTreeGating
  readonly search: string
  readonly rows: readonly TreeRow[]
  readonly pinned: readonly PinnedRow[]
  /** The selection's lazy attrs preview (§7.4), or `null` when gated off / nothing selected / unmapped. */
  readonly attrsPreview: PreviewNode | null
  /** The selection's lazy state preview (§7.4); see {@link attrsPreview}. */
  readonly statePreview: PreviewNode | null
  /** Fetched replacements for expanded getter/max-depth/paginated attrs paths, keyed by `pathKey` (task 0020). */
  readonly attrsOverrides: ReadonlyMap<string, PreviewNode>
  /** Fetched replacements for expanded getter/max-depth/paginated state paths; see {@link attrsOverrides}. */
  readonly stateOverrides: ReadonlyMap<string, PreviewNode>
}

/** Everything the Mithril views render from — a pull-based snapshot. */
export interface OverlayViewState {
  readonly picker: PickerState
  readonly picking: boolean
  readonly collapsed: boolean
  readonly offset: { x: number; y: number } | null
  readonly activeTab: OverlayTab
  readonly hover: HoverInfo | null
  readonly hoverRects: readonly HighlightRect[]
  readonly selection: SelectionSnapshot
  /** Display name of the selection's nearest component, or `null`. */
  readonly selectedComponentName: ComponentNameInfo | null
  /** Root-first ancestry chain for the selection's owning component, including itself (§8.3, §9.1). */
  readonly ancestry: readonly AncestryEntry[]
  /** Reveal-component choices for the selection's own nearest component (§9.3); `[]` when nothing is selected or resolved. */
  readonly selectedComponentChoices: readonly SourceChoice[]
  /** The ancestry entry currently focused via `focusAncestor` (§9.3), or `null`. */
  readonly focusedAncestorId: ComponentId | null
  readonly frozenRects: readonly HighlightRect[]
  readonly diagnostics: readonly Diagnostic[]
  /** The Components tab's tree/attrs/state state (task 0022). */
  readonly componentTree: ComponentTreeViewState
}

/** Structural click event (satisfied by `MouseEvent`); testable without the DOM. */
export interface ClickEvent {
  readonly clientX: number
  readonly clientY: number
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly metaKey: boolean
  preventDefault(): void
  stopPropagation(): void
}

export interface OverlayControllerDeps {
  readonly hook: OverlayHook | null
  readonly options: OverlayOptions
  readonly doc?: Pick<Document, "elementsFromPoint">
  readonly redraw?: () => void
  readonly openInEditor?: OpenInEditor
  readonly storage?: StorageLike | null
  readonly diagnostics?: DiagnosticsLog
}

export interface OverlayController {
  readonly options: OverlayOptions
  readonly diagnostics: DiagnosticsLog
  getState(): OverlayViewState
  setHost(host: Element): void

  toggleCollapsed(): void
  setCollapsed(collapsed: boolean): void
  setActiveTab(tab: OverlayTab): void
  setOffset(offset: { x: number; y: number } | null): void

  togglePicker(): void
  startPicker(): void
  stopPicker(): void
  isPicking(): boolean

  handlePointerMove(x: number, y: number): void
  handleClick(event: ClickEvent): boolean
  handleKeyDown(event: KeyboardEvent): boolean
  handleKeyUp(event: KeyboardEvent): boolean
  refreshHighlight(): void

  openSelectedInEditor(): void
  openLocationInEditor(location: SourceLocation): void
  clearSelection(): void
  promoteStaleSelection(): void

  /** Highlight an ancestry entry's own DOM range and mark it focused (§9.3). */
  focusAncestor(id: ComponentId): void
  /** Open a component's source — the most-precise available choice, or a specific `kind` (§9.3). */
  revealComponent(id: ComponentId, kind?: SourceChoiceKind): void

  // --- Components tab: tree/search/pin/attrs+state (task 0022) -----------
  setTreeSearch(query: string): void
  toggleTreeNode(id: ComponentId): void
  togglePinned(id: ComponentId): void
  /** Select a tree row's component — the reverse of a DOM pick (§9.3): highlights its DOM range and updates the shared selection. */
  selectComponent(id: ComponentId): void
  /** Scroll a component's first rendered DOM node into view (§9.3), respecting reduced-motion (§18). */
  scrollComponentIntoView(id: ComponentId): void
  /** Evaluate a getter, page a container, or expand a `max-depth` stub in the currently-selected component's attrs/state preview (§7.4). */
  expandComponentPreview(target: "attrs" | "state", path: PreviewPath, options?: ExpandPreviewOptions): void

  /** Unsubscribe from the runtime and release resources (idempotent). */
  dispose(): void
}

interface Shortcuts {
  readonly toggle: ShortcutSpec | null
  readonly hold: ShortcutSpec | null
  readonly open: ShortcutSpec | null
  readonly cancel: ShortcutSpec | null
}

/** The nearest `Element` a component's DOM range can be selected/scrolled/highlighted through, or `null` (§9.3). */
function representativeElementOf(range: DomRange | null | undefined): Element | null {
  const node = range?.first ?? null
  if (node === null) return null
  return node instanceof Element ? node : node.parentElement
}

/** `matchMedia`-backed reduced-motion check (§18); degrades to `false` where `matchMedia` is unavailable (e.g. jsdom). */
function prefersReducedMotion(): boolean {
  const matchMedia = (globalThis as { matchMedia?: (query: string) => { matches: boolean } }).matchMedia
  if (typeof matchMedia !== "function") return false
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

function editorRequestOf(location: SourceLocation): EditorRequest | null {
  const file = location.relativeFile || location.absoluteFile
  if (!file || !Number.isFinite(location.line) || location.line <= 0) return null
  const column = Number.isFinite(location.column) && location.column > 0 ? location.column : 1
  return { file, line: location.line, column }
}

export function createOverlayController(deps: OverlayControllerDeps): OverlayController {
  const { hook, options } = deps
  const doc = deps.doc ?? (globalThis as { document?: Document }).document ?? { elementsFromPoint: () => [] }
  const storage = deps.storage === undefined ? undefined : deps.storage
  const diagnostics = deps.diagnostics ?? createDiagnostics()
  const openInEditor: OpenInEditor = deps.openInEditor ?? createEditorClient()
  const redraw = (): void => {
    if (deps.redraw) diagnostics.guard("redraw", deps.redraw, undefined)
  }

  const shortcuts: Shortcuts = {
    toggle: parseShortcut(options.picker.toggleShortcut),
    hold: parseShortcut(options.picker.holdShortcut),
    open: parseShortcut(options.picker.openShortcut),
    cancel: parseShortcut(options.picker.cancelShortcut),
  }

  let host: Element | null = null
  const isExcluded = (element: Element): boolean => isWithinHost(element, host)

  // Resolve a node's source/component through the runtime hook (§8.5).
  const resolveNode = (node: Element): SelectionData =>
    diagnostics.guard<SelectionData>(
      "resolve",
      () => {
        hook?.flush()
        const source = hook?.resolveDomSource(node) ?? null
        const componentId = hook?.resolveDomComponent(node) ?? null
        return { source, componentId }
      },
      { source: null, componentId: null },
    )

  const componentNameOf = (componentId: ComponentId | null): ComponentNameInfo | null => {
    if (componentId === null) return null
    const record = hook?.componentRecord(componentId)
    if (record === undefined) return null
    return { name: record.displayName, inferred: record.displayNameInferred === true }
  }

  // §9.3's three open targets for a component, most-precise first: the
  // rendered element's own exact mapping, then the component-view marker,
  // then the component-declaration location already on the record. Only the
  // ones that actually resolve are returned.
  const computeChoices = (record: ComponentRecord): SourceChoice[] => {
    const choices: SourceChoice[] = []
    const rangeFirst = record.domRange?.first ?? null
    const elementLocation = rangeFirst !== null ? hook?.resolveDomSource(rangeFirst) ?? null : null
    if (elementLocation !== null) {
      choices.push({
        kind: "element",
        label: SOURCE_CHOICE_LABELS.element,
        location: elementLocation,
        mapping: describeMapping(elementLocation),
      })
    }
    const viewLocation = hook?.componentViewSource(record.id) ?? null
    if (viewLocation !== null) {
      choices.push({
        kind: "view",
        label: SOURCE_CHOICE_LABELS.view,
        location: viewLocation,
        mapping: describeMapping(viewLocation),
      })
    }
    if (record.source !== null) {
      choices.push({
        kind: "declaration",
        label: SOURCE_CHOICE_LABELS.declaration,
        location: record.source,
        mapping: describeMapping(record.source),
      })
    }
    return choices
  }

  const selection = createSelectionModel((node) => resolveNode(node))
  const picker: PickerMachine = createPickerMachine()

  // Editor-open primitives shared by the details actions and the Enter shortcut.
  const doOpenLocation = (location: SourceLocation): void => {
    const request = editorRequestOf(location)
    if (request === null) {
      diagnostics.record("editor", new Error("Source location has no usable file/line"))
      redraw()
      return
    }
    void openInEditor(request)
      .then((result) => {
        if (!result.ok) {
          diagnostics.record("editor", new Error(result.error?.message ?? "Editor launch failed"))
          redraw()
        }
      })
      .catch((error: unknown) => {
        diagnostics.record("editor", error)
        redraw()
      })
  }
  const doOpenSelected = (): void => {
    const snap = selection.snapshot()
    if (snap.source === null) {
      diagnostics.record("editor", new Error("Selected element has no source location"))
      redraw()
      return
    }
    doOpenLocation(snap.source)
  }
  // The Enter shortcut (§8.4): open the selection if any, else the current hover.
  const openCurrent = (): boolean => {
    if (selection.snapshot().source !== null) {
      doOpenSelected()
      return true
    }
    const location = hover?.mapping.location ?? null
    if (picker.isPicking() && location !== null) {
      doOpenLocation(location)
      return true
    }
    return false
  }

  // --- Reactive fields the views read via getState() -----------------------
  const persisted = loadOverlayState(storage)
  let collapsed = persisted.collapsed ?? !options.defaultOpen
  let offset: { x: number; y: number } | null = persisted.offset ?? null
  let activeTab: OverlayTab = persisted.activeTab ?? "inspector"
  let hover: HoverInfo | null = null
  let hoverRects: readonly HighlightRect[] = []
  let frozenRects: readonly HighlightRect[] = []
  // The ancestry entry currently highlighted via `focusAncestor` (§9.3); reset
  // whenever the underlying selection changes so a stale ancestor never lingers.
  let focusedAncestorId: ComponentId | null = null

  // --- Components tab: tree/search/pin/attrs+state (task 0022) -------------
  // Seeded once from getSnapshot() and patched incrementally from batched
  // RuntimeEvents (§9.4) — never re-fetched wholesale. Only initialized when
  // the feature is actually enabled (§11.1 componentTree.enabled), so a host
  // that hasn't opted in pays no subscription/seeding cost at all (§17).
  const treeStore: ComponentTreeStore = createComponentTreeStore()
  if (persisted.treeSearch !== undefined) treeStore.setSearch(persisted.treeSearch)
  let unsubscribeTree: (() => void) | null = null
  if (options.componentTree.enabled && hook !== null && hook !== undefined) {
    diagnostics.guard(
      "tree",
      () => {
        treeStore.seed(hook.getSnapshot())
        return undefined
      },
      undefined,
    )
    unsubscribeTree = hook.subscribe((event) => {
      diagnostics.guard(
        "tree",
        () => {
          treeStore.applyEvent(event)
          redraw()
          return undefined
        },
        undefined,
      )
    })
  }
  // Fetched replacements for expanded getter/max-depth/paginated preview
  // paths (task 0020), keyed by `pathKey`. Reset whenever the selected
  // component changes so a stale expansion never leaks onto a new selection.
  let attrsOverrides = new Map<string, PreviewNode>()
  let stateOverrides = new Map<string, PreviewNode>()
  const resetPreviewOverrides = (): void => {
    attrsOverrides = new Map()
    stateOverrides = new Map()
  }

  const persist = (): void => {
    saveOverlayState({ collapsed, offset, activeTab, treeSearch: treeStore.getSearch() }, storage)
  }

  const clearHover = (): void => {
    hover = null
    hoverRects = []
    picker.dispatch({ type: "hover", target: null })
  }

  const recomputeFrozen = (): void => {
    if (focusedAncestorId !== null) {
      const range = hook?.componentRecord(focusedAncestorId)?.domRange
      if (range !== null && range !== undefined && range.first !== null && range.first.isConnected) {
        frozenRects = rectsOfDomRange(range)
        return
      }
    }
    const node = selection.snapshot().node
    frozenRects = node !== null && node.isConnected ? [rectOfElement(node)] : []
  }

  const controller: OverlayController = {
    options,
    diagnostics,

    getState() {
      const snapshot = selection.snapshot()
      const ancestryRecords = snapshot.componentId !== null ? hook?.componentAncestry(snapshot.componentId) ?? [] : []
      const ancestry: AncestryEntry[] = ancestryRecords.map((record) => ({
        id: record.id,
        name: { name: record.displayName, inferred: record.displayNameInferred === true },
        mounted: record.mounted,
        choices: computeChoices(record),
      }))
      const selectedComponentChoices = ancestry.length > 0 ? ancestry[ancestry.length - 1]!.choices : []

      const gating: ComponentTreeGating = {
        enabled: options.componentTree.enabled,
        fullMode: (hook?.getMode() ?? "source") === "full",
        captureAttrs: options.componentTree.captureAttrs,
        captureState: options.componentTree.captureState,
      }
      const selectedId = snapshot.componentId
      const attrsAvailable = gating.enabled && gating.fullMode && gating.captureAttrs && selectedId !== null
      const stateAvailable = gating.enabled && gating.fullMode && gating.captureState && selectedId !== null
      const componentTree: ComponentTreeViewState = {
        gating,
        search: treeStore.getSearch(),
        rows: treeStore.rows(),
        pinned: treeStore.pinnedRows(),
        attrsPreview: attrsAvailable ? hook?.attrsPreview(selectedId) ?? null : null,
        statePreview: stateAvailable ? hook?.statePreview(selectedId) ?? null : null,
        attrsOverrides,
        stateOverrides,
      }

      return {
        picker: picker.getState(),
        picking: picker.isPicking(),
        collapsed,
        offset,
        activeTab,
        hover,
        hoverRects,
        selection: snapshot,
        selectedComponentName: componentNameOf(snapshot.componentId),
        ancestry,
        selectedComponentChoices,
        focusedAncestorId,
        frozenRects,
        diagnostics: diagnostics.list(),
        componentTree,
      }
    },

    setHost(next) {
      host = next
    },

    // --- Panel / layout ----------------------------------------------------
    toggleCollapsed() {
      collapsed = !collapsed
      persist()
      redraw()
    },
    setCollapsed(next) {
      if (collapsed === next) return
      collapsed = next
      persist()
      redraw()
    },
    setActiveTab(tab) {
      activeTab = tab
      persist()
      redraw()
    },
    setOffset(next) {
      offset = next
      persist()
      redraw()
    },

    // --- Picker control ----------------------------------------------------
    isPicking() {
      return picker.isPicking()
    },
    togglePicker() {
      if (!options.picker.enabled) return
      picker.dispatch({ type: "toggle" })
      if (!picker.isPicking()) clearHover()
      redraw()
    },
    startPicker() {
      if (!options.picker.enabled || picker.isPicking()) return
      picker.dispatch({ type: "toggle" })
      redraw()
    },
    stopPicker() {
      if (!picker.isPicking()) return
      picker.dispatch({ type: "cancel" })
      clearHover()
      redraw()
    },

    // --- Pointer / interaction --------------------------------------------
    handlePointerMove(x, y) {
      diagnostics.guard(
        "hover",
        () => {
          if (!picker.isPicking()) return
          const target = eligibleElementAt(doc, x, y, isExcluded)
          if (target === null) {
            clearHover()
            redraw()
            return
          }
          const { source, componentId } = resolveNode(target)
          picker.dispatch({ type: "hover", target })
          hover = {
            element: describeElement(target),
            componentName: componentNameOf(componentId),
            mapping: describeMapping(source),
          }
          hoverRects = [rectOfElement(target)]
          redraw()
        },
        undefined,
      )
    },

    handleClick(event) {
      if (!picker.isPicking()) return false
      // Pass-through modifier lets the application click proceed (§8.7).
      if (isModifierHeld(event, options.picker.passThroughModifier)) return false

      // Prevent the application click by default (§8.7).
      event.preventDefault()
      event.stopPropagation()

      diagnostics.guard(
        "select",
        () => {
          const hovered = picker.getState().hovered
          const target =
            hovered !== null && hovered.isConnected
              ? hovered
              : eligibleElementAt(doc, event.clientX, event.clientY, isExcluded)
          if (target === null) return

          const data = resolveNode(target)
          selection.select(target, data)
          focusedAncestorId = null // a new selection starts with no ancestor focused
          frozenRects = [rectOfElement(target)]
          resetPreviewOverrides()
          collapsed = false // show the details panel (§8.7)
          activeTab = "inspector"
          persist()

          if (options.picker.openOnClick) controller.openSelectedInEditor()

          picker.dispatch({ type: "select", continuous: options.picker.continuous })
          if (!picker.isPicking()) clearHover()
          redraw()
        },
        undefined,
      )
      return true
    },

    handleKeyDown(event) {
      return diagnostics.guard(
        "keydown",
        () => {
          if (matchesShortcut(event, shortcuts.cancel)) {
            if (picker.isPicking()) {
              event.preventDefault()
              controller.stopPicker()
              return true
            }
            return false
          }
          if (matchesShortcut(event, shortcuts.open)) {
            const acted = openCurrent()
            if (acted) event.preventDefault()
            return acted
          }
          if (matchesShortcut(event, shortcuts.toggle)) {
            event.preventDefault()
            controller.togglePicker()
            return true
          }
          if (options.picker.enabled && matchesHold(event, shortcuts.hold)) {
            if (!picker.isPicking()) {
              picker.dispatch({ type: "hold-start" })
              redraw()
            }
            return true
          }
          return false
        },
        false,
      )
    },

    handleKeyUp(event) {
      return diagnostics.guard(
        "keyup",
        () => {
          const state = picker.getState()
          if (state.phase === "picking" && state.activation === "hold" && !matchesHold(event, shortcuts.hold)) {
            picker.dispatch({ type: "hold-end" })
            clearHover()
            redraw()
            return true
          }
          return false
        },
        false,
      )
    },

    refreshHighlight() {
      diagnostics.guard(
        "highlight",
        () => {
          const hovered = picker.getState().hovered
          hoverRects = picker.isPicking() && hovered !== null && hovered.isConnected ? [rectOfElement(hovered)] : []
          recomputeFrozen()
          redraw()
        },
        undefined,
      )
    },

    // --- Details actions ---------------------------------------------------
    openSelectedInEditor() {
      doOpenSelected()
    },

    openLocationInEditor(location) {
      doOpenLocation(location)
    },

    clearSelection() {
      selection.clear()
      focusedAncestorId = null
      frozenRects = []
      resetPreviewOverrides()
      redraw()
    },

    promoteStaleSelection() {
      focusedAncestorId = null
      resetPreviewOverrides()
      if (selection.promoteToNearestAncestor()) {
        recomputeFrozen()
        redraw()
      }
    },

    focusAncestor(id) {
      focusedAncestorId = id
      recomputeFrozen()
      redraw()
    },

    revealComponent(id, kind) {
      diagnostics.guard(
        "editor",
        () => {
          const record = hook?.componentRecord(id)
          if (record === undefined) {
            diagnostics.record("editor", new Error("Component is no longer available"))
            redraw()
            return
          }
          const choices = computeChoices(record)
          const choice = (kind !== undefined ? choices.find((c) => c.kind === kind) : undefined) ?? choices[0]
          if (choice === undefined) {
            diagnostics.record("editor", new Error("No source location available for this component"))
            redraw()
            return
          }
          doOpenLocation(choice.location)
        },
        undefined,
      )
    },

    // --- Components tab: tree/search/pin/attrs+state (task 0022) -----------
    setTreeSearch(query) {
      treeStore.setSearch(query)
      persist()
      redraw()
    },
    toggleTreeNode(id) {
      treeStore.toggleCollapsed(id)
      redraw()
    },
    togglePinned(id) {
      treeStore.togglePinned(id)
      redraw()
    },

    selectComponent(id) {
      diagnostics.guard(
        "select",
        () => {
          const record = hook?.componentRecord(id)
          if (record === undefined) {
            diagnostics.record("select", new Error("Component is no longer available"))
            redraw()
            return
          }
          const element = representativeElementOf(record.domRange)
          if (element === null) {
            diagnostics.record("select", new Error("Component has no associated DOM to select"))
            redraw()
            return
          }
          const source = hook?.resolveDomSource(element) ?? null
          selection.select(element, { source, componentId: id })
          focusedAncestorId = null
          frozenRects = record.domRange !== null ? rectsOfDomRange(record.domRange) : [rectOfElement(element)]
          resetPreviewOverrides()
          redraw()
        },
        undefined,
      )
    },

    scrollComponentIntoView(id) {
      diagnostics.guard(
        "scroll",
        () => {
          const record = hook?.componentRecord(id)
          const element = representativeElementOf(record?.domRange)
          if (element === null) {
            diagnostics.record("scroll", new Error("Component has no associated DOM to scroll to"))
            redraw()
            return
          }
          element.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" })
        },
        undefined,
      )
    },

    expandComponentPreview(target, path, expandOptions) {
      diagnostics.guard(
        "preview",
        () => {
          const id = selection.snapshot().componentId
          if (id === null) return
          const node = hook?.expandPreview(id, target, path, expandOptions) ?? null
          if (node === null) {
            diagnostics.record("preview", new Error("Unable to expand this value"))
            redraw()
            return
          }
          const key = pathKey(path)
          if (target === "attrs") attrsOverrides.set(key, node)
          else stateOverrides.set(key, node)
          redraw()
        },
        undefined,
      )
    },

    dispose() {
      unsubscribeTree?.()
    },
  }

  return controller
}
