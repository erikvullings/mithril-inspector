import type { ComponentId, EditorRequest, SourceLocation } from "@mithril-inspector/protocol"

import { createDiagnostics, type Diagnostic, type DiagnosticsLog } from "./diagnostics.js"
import { describeElement, eligibleElementAt, isWithinHost } from "./element-info.js"
import { createEditorClient, type OpenInEditor } from "./editor.js"
import { rectOfElement, type HighlightRect } from "./highlight.js"
import type { OverlayHook } from "./hook.js"
import { describeMapping, type MappingInfo } from "./mapping.js"
import type { OverlayOptions } from "./options.js"
import {
  createPickerMachine,
  type PickerMachine,
  type PickerState,
} from "./picker.js"
import { loadOverlayState, saveOverlayState, type StorageLike } from "./persistence.js"
import { createSelectionModel, type SelectionData, type SelectionSnapshot } from "./selection.js"
import {
  isModifierHeld,
  matchesHold,
  matchesShortcut,
  parseShortcut,
  type ShortcutSpec,
} from "./shortcuts.js"

export type OverlayTab = "inspector" | "components" | "settings"

/** The badge shown while hovering an instrumented element (§8.5). */
export interface HoverInfo {
  readonly element: string
  readonly componentName: string | null
  readonly mapping: MappingInfo
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
  readonly selectedComponentName: string | null
  readonly frozenRects: readonly HighlightRect[]
  readonly diagnostics: readonly Diagnostic[]
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
}

interface Shortcuts {
  readonly toggle: ShortcutSpec | null
  readonly hold: ShortcutSpec | null
  readonly open: ShortcutSpec | null
  readonly cancel: ShortcutSpec | null
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

  const componentNameOf = (componentId: ComponentId | null): string | null =>
    componentId === null ? null : hook?.componentRecord(componentId)?.displayName ?? null

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
  let activeTab: OverlayTab = "inspector"
  let hover: HoverInfo | null = null
  let hoverRects: readonly HighlightRect[] = []
  let frozenRects: readonly HighlightRect[] = []

  const persist = (): void => {
    saveOverlayState({ collapsed, offset }, storage)
  }

  const clearHover = (): void => {
    hover = null
    hoverRects = []
    picker.dispatch({ type: "hover", target: null })
  }

  const recomputeFrozen = (): void => {
    const node = selection.snapshot().node
    frozenRects = node !== null && node.isConnected ? [rectOfElement(node)] : []
  }

  const controller: OverlayController = {
    options,
    diagnostics,

    getState() {
      const snapshot = selection.snapshot()
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
        frozenRects,
        diagnostics: diagnostics.list(),
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
          frozenRects = [rectOfElement(target)]
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
      frozenRects = []
      redraw()
    },

    promoteStaleSelection() {
      if (selection.promoteToNearestAncestor()) {
        recomputeFrozen()
        redraw()
      }
    },
  }

  return controller
}
