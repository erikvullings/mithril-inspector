import type {
  ComponentId,
  ComponentRecord,
  DomRange,
  EditorRequest,
  PreviewNode,
  PreviewPath,
  RuntimeEvent,
  SourceLocation,
} from "@mithril-inspector/protocol"

import { createDiagnostics, type Diagnostic, type DiagnosticsLog } from "./diagnostics.js"
import { describeElement, eligibleElementAt, isWithinHost } from "./element-info.js"
import { createEditorClient, type OpenInEditor } from "./editor.js"
import {
  createHistoryStore,
  hasMeaningfulHistoryData,
  type HistoryDiffEntry,
  type HistoryEntry,
  type HistoryFilter,
  type HistorySource,
  type HistoryStore,
} from "./history.js"
import { rectOfElement, rectsOfDomRange, type HighlightRect } from "./highlight.js"
import type { ExpandPreviewOptions, OverlayHook } from "./hook.js"
import { describeMapping, type MappingInfo } from "./mapping.js"
import type { OverlayOptions, OverlayTheme } from "./options.js"
import {
  createPickerMachine,
  isPicking,
  type PickerMachine,
  type PickerState,
} from "./picker.js"
import { loadOverlayState, saveOverlayState, type StorageLike } from "./persistence.js"
import { pathKey } from "./preview.js"
import { componentsWithMutatedDom, type DomMutationLike } from "./redraw-flash.js"
import { createSelectionModel, type SelectionData, type SelectionSnapshot } from "./selection.js"
import {
  isModifierHeld,
  matchesHold,
  matchesShortcut,
  parseShortcut,
  PICKER_SHORTCUT_KEYS,
  type PickerShortcutKey,
  type PickerShortcutSettings,
  type ShortcutSpec,
} from "./shortcuts.js"
import { createComponentTreeStore, type ComponentTreeStore, type PinnedRow, type TreeRow } from "./tree.js"

export type OverlayTab = "components" | "history" | "settings"

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
  /** The vnode's `key` attribute (§9.1), or `null` — distinguishes keyed siblings in the breadcrumb. */
  readonly key: string | number | null
  readonly mounted: boolean
  readonly choices: readonly SourceChoice[]
  /** See `ComponentRecord.renderDuration` (§17 diagnostics, task 0029). */
  readonly renderDuration: number | null
  /** See `ComponentRecord.slowRenderCount` (task 0029). */
  readonly slowRenderCount: number
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
  /**
   * Local UI expand state (by `pathKey`) for a nested attrs container already
   * loaded in the initial preview — separate from `attrsOverrides`, which is
   * only for data that had to be *fetched*. A container's data can be present
   * (within the serializer's `maxDepth`) yet still start collapsed behind a
   * one-line devtools-style preview until the user clicks to expand it.
   */
  readonly expandedAttrsPaths: ReadonlySet<string>
  /** Local UI expand state for a nested state container; see {@link expandedAttrsPaths}. */
  readonly expandedStatePaths: ReadonlySet<string>
}

/**
 * The State History tab's state (task 0027) — a read-only timeline of a
 * watched component's attrs and state previews (task 0027 follow-up: attrs
 * history), recorded on each redraw, plus a diff against the selected
 * entry's own predecessor. Gated identically to the Components tab's
 * attrs/state sections ({@link ComponentTreeGating}): no separate gate is
 * invented for this feature.
 */
export interface HistoryViewState {
  readonly gating: ComponentTreeGating
  /** The component whose state is being recorded — the current selection, or `null` if none. */
  readonly watchedComponentId: ComponentId | null
  readonly entries: readonly HistoryEntry[]
  readonly selectedEntryId: number | null
  /** The selected entry's diff against its predecessor, already scoped to {@link sources} (task 0027 follow-up). */
  readonly diff: readonly HistoryDiffEntry[]
  /** The user's chosen scope — "both" unless they've explicitly narrowed it via `setHistoryFilter` (task 0027 follow-up). */
  readonly filter: HistoryFilter
  /** Whether any recorded entry ever carried real state data — see {@link hasMeaningfulHistoryData}. */
  readonly hasStateData: boolean
  /** Whether any recorded entry ever carried real attrs data; see {@link hasStateData}. */
  readonly hasAttrsData: boolean
  /**
   * `filter` resolved against what's actually available — e.g. `filter:
   * "both"` for a component whose state is always empty (an attrs-only
   * presentational component) resolves to just `["attrs"]`, not
   * `["attrs", "state"]`: there's no point offering a toggle between
   * "something" and "always empty" (task 0027 follow-up).
   */
  readonly sources: readonly HistorySource[]
}

/**
 * A component whose own DOM actually mutated on a recent redraw (task 0030),
 * still within its brief on-screen fade window. `seq` is a monotonically
 * increasing per-occurrence id (not just per-component) so a component that
 * flashes again while still fading gets a fresh value — the view keys each
 * flash's DOM node on it so Mithril inserts a genuinely new element rather
 * than diff-reusing the old one, which is what makes the CSS fade animation
 * restart instead of staying at its already-completed end state.
 */
export interface FlashEntry {
  readonly componentId: ComponentId
  readonly seq: number
  readonly rects: readonly HighlightRect[]
}

/** Everything the Mithril views render from — a pull-based snapshot. */
export interface OverlayViewState {
  readonly picker: PickerState
  readonly picking: boolean
  readonly collapsed: boolean
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
  /** Components whose own DOM actually mutated on a recent redraw, still within their brief fade window (task 0030). */
  readonly flashes: readonly FlashEntry[]
  readonly diagnostics: readonly Diagnostic[]
  /** The Components tab's tree/attrs/state state (task 0022). */
  readonly componentTree: ComponentTreeViewState
  /** The State History tab's state (task 0027). */
  readonly history: HistoryViewState
  /** The picker's current shortcut/modifier settings — app-configured defaults, live-overridable from the Settings tab. */
  readonly pickerShortcuts: PickerShortcutSettings
  /** The user's live on/off preference for the picking banner (§18, Settings tab checkbox) — independent of its momentary auto-hide timing. */
  readonly showPickingBanner: boolean
  /** Whether redraw-flash visualization is currently on (task 0030, Settings tab checkbox); seeded from `options.redrawFlash.enabled`, live-toggleable, persists across reloads. */
  readonly redrawFlashEnabled: boolean
  /** Whether the picking banner should actually render right now: picking, `showPickingBanner` is on, and it hasn't auto-hidden yet this session. */
  readonly pickingBannerVisible: boolean
  /** The effective theme (§8.1): the app-configured `options.theme` unless the Settings tab overrode it. */
  readonly theme: OverlayTheme
  /**
   * Whether attrs/state redaction is currently active (§15, Settings tab
   * toggle) — read live from the runtime, not overlay-local state: it's the
   * runtime's serializer that actually applies it. `true` when there is no
   * hook (production/no-runtime), matching the safe default.
   */
  readonly redactionEnabled: boolean
  /** The full active set of redacted key patterns (§15, Settings tab display) — configured defaults plus anything added there. */
  readonly redactionKeys: readonly string[]
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

  togglePicker(): void
  startPicker(): void
  stopPicker(): void
  isPicking(): boolean

  handlePointerMove(x: number, y: number): void
  handleClick(event: ClickEvent): boolean
  handleKeyDown(event: KeyboardEvent): boolean
  handleKeyUp(event: KeyboardEvent): boolean
  refreshHighlight(): void

  /**
   * Feed a batch of observed DOM mutations through to the redraw-flash
   * detector (task 0030) — a no-op unless the live `redrawFlashEnabled`
   * setting (Settings tab checkbox, seeded from `options.redrawFlash.enabled`)
   * is on and the runtime is in `mode: "full"`. The caller (`overlay.ts`) owns
   * the actual `MutationObserver`/rAF throttling — it installs unconditionally
   * in `mode: "full"` so toggling this on later takes effect immediately —
   * this is pure attribution + timed state.
   */
  recordDomMutations(records: readonly DomMutationLike[]): void

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
  /** Toggle the local (already-loaded) collapsed/expanded UI state of a nested attrs/state container. */
  togglePreviewExpanded(target: "attrs" | "state", path: PreviewPath): void

  // --- History tab: state-history panel (task 0027) -----------------------
  /** Select an entry to view/diff, or `null` to fall back to the latest one — local UI state only. */
  selectHistoryEntry(id: number | null): void
  /** Narrow the History tab's combined timeline to just attrs, just state, or both (task 0027 follow-up) — local UI state only. */
  setHistoryFilter(filter: HistoryFilter): void

  // --- Settings tab: live picker shortcut editing --------------------------
  /** Rebind a picker shortcut/modifier to a new raw string (e.g. "Alt+Shift"); persists and takes effect immediately. */
  setPickerShortcutValue(key: PickerShortcutKey, value: string): void
  /** Enable/disable a picker shortcut without discarding its typed value (e.g. it collides with an app the user is inspecting). */
  setPickerShortcutEnabled(key: PickerShortcutKey, enabled: boolean): void
  /** Revert a picker shortcut to the app-configured value (`options.picker`), discarding any Settings-tab override. */
  resetPickerShortcut(key: PickerShortcutKey): void
  /** Show/hide the picking-active banner (§18); persists across reloads. */
  setShowPickingBanner(show: boolean): void
  /** Turn redraw-flash visualization on/off (task 0030, Settings tab); persists across reloads. Only visible in `mode: "full"` — see {@link OverlayViewState.redrawFlashEnabled}. */
  setRedrawFlashEnabled(enabled: boolean): void
  /** Override the theme (§8.1) from the Settings tab; persists and takes effect immediately. */
  setTheme(theme: OverlayTheme): void
  /** Revert to the app-configured `options.theme`, discarding any Settings-tab override. */
  resetTheme(): void
  /** Turn attrs/state redaction on/off (§15, Settings tab) — session-only; see {@link OverlayViewState.redactionEnabled}. */
  setRedactionEnabled(enabled: boolean): void
  /** Add a redaction key pattern from the Settings tab (§15); persists across reloads. Ignores a blank pattern. */
  addRedactionKey(key: string): void

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

  // Picking-active banner (§18): auto-hides itself a few seconds after each
  // fresh idle -> picking transition, independent of whether `showBanner` is
  // even on (that only gates whether it's rendered at all, computed in
  // getState()) — re-armed every time a new picking session starts.
  const PICKING_BANNER_TIMEOUT_MS = 4000
  let bannerDismissed = false
  let bannerTimer: ReturnType<typeof setTimeout> | null = null
  const clearBannerTimer = (): void => {
    if (bannerTimer !== null) {
      clearTimeout(bannerTimer)
      bannerTimer = null
    }
  }
  const armBannerTimer = (): void => {
    clearBannerTimer()
    bannerDismissed = false
    bannerTimer = setTimeout(() => {
      bannerDismissed = true
      bannerTimer = null
      redraw()
    }, PICKING_BANNER_TIMEOUT_MS)
  }

  const selection = createSelectionModel((node) => resolveNode(node))
  const picker: PickerMachine = createPickerMachine((next, previous) => {
    if (isPicking(next) && !isPicking(previous)) armBannerTimer()
    else if (!isPicking(next)) clearBannerTimer()
  })

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
  let activeTab: OverlayTab = persisted.activeTab ?? "components"
  let showBanner = persisted.showPickingBanner ?? options.picker.showBanner
  let redrawFlashEnabled = persisted.redrawFlashEnabled ?? options.redrawFlash.enabled
  let theme: OverlayTheme = persisted.theme ?? options.theme

  // §15: extra redaction keys added from the Settings tab persist across
  // reloads (unlike the on/off toggle, they only ever narrow what's
  // redacted) — replay them onto the fresh runtime hook once here, since
  // createRuntime() always starts with none of its own.
  let addedRedactionKeys: string[] = persisted.extraRedactKeys !== undefined ? [...persisted.extraRedactKeys] : []
  for (const key of addedRedactionKeys) hook?.addRedactionKey(key)

  // --- Settings tab: live-editable picker shortcuts -------------------------
  // Seeded from the app-configured `options.picker` values, overridden by
  // anything the user rebound from the Settings tab last session. Mutable
  // (unlike `options`, which stays the immutable app configuration) so a
  // Settings-tab edit takes effect immediately without remounting.
  let shortcutSettings: PickerShortcutSettings = (() => {
    const out = {} as Record<PickerShortcutKey, { value: string; enabled: boolean }>
    for (const key of PICKER_SHORTCUT_KEYS) {
      const override = persisted.pickerShortcuts?.[key]
      out[key] = override ?? { value: options.picker[key], enabled: parseShortcut(options.picker[key]) !== null }
    }
    return out
  })()

  const effectiveShortcutString = (key: PickerShortcutKey): string => {
    const setting = shortcutSettings[key]
    return setting.enabled ? setting.value : "none"
  }

  const computeShortcuts = (): Shortcuts => ({
    toggle: parseShortcut(effectiveShortcutString("toggleShortcut")),
    hold: parseShortcut(effectiveShortcutString("holdShortcut")),
    open: parseShortcut(effectiveShortcutString("openShortcut")),
    cancel: parseShortcut(effectiveShortcutString("cancelShortcut")),
  })

  let shortcuts: Shortcuts = computeShortcuts()

  let hover: HoverInfo | null = null
  let hoverRects: readonly HighlightRect[] = []
  let frozenRects: readonly HighlightRect[] = []
  // The ancestry entry currently highlighted via `focusAncestor` (§9.3); reset
  // whenever the underlying selection changes so a stale ancestor never lingers.
  let focusedAncestorId: ComponentId | null = null

  // --- Redraw-flash visualization (task 0030) -------------------------------
  // A brief, self-clearing highlight per component whose own DOM actually
  // mutated (not merely whose `view()` ran) — see `recordDomMutations` below.
  // Each entry's timer is the sole owner of its own removal; refreshing an
  // already-flashing component clears the old timer before arming a new one,
  // so there is never more than one live timer per component id.
  interface FlashState {
    readonly rects: readonly HighlightRect[]
    readonly seq: number
    readonly timer: ReturnType<typeof setTimeout>
  }
  const REDRAW_FLASH_DURATION_MS = 400
  const flashesById = new Map<ComponentId, FlashState>()
  let nextFlashSeq = 0

  // --- Components tab: tree/search/pin/attrs+state (task 0022) -------------
  // Seeded once from getSnapshot() and patched incrementally from batched
  // RuntimeEvents (§9.4) — never re-fetched wholesale. Only initialized when
  // the feature is actually enabled (§11.1 componentTree.enabled), so a host
  // that hasn't opted in pays no subscription/seeding cost at all (§17).
  const treeStore: ComponentTreeStore = createComponentTreeStore()
  if (persisted.treeSearch !== undefined) treeStore.setSearch(persisted.treeSearch)

  // The State History tab's store (task 0027) — cheap to create unconditionally
  // (an empty buffer); only actually populated once something is watched and
  // `computeGating()` allows it, same as the componentTree.enabled-gated
  // subscription below that drives it.
  const historyStore: HistoryStore = createHistoryStore({ limit: options.historyLimit })
  // The user's chosen History-tab scope (task 0027 follow-up) — a UI-only
  // preference, reset to "both" whenever the watched component changes (see
  // `watchComponent`) since a filter tuned to one component's shape (e.g.
  // "state" for a component with no attrs) doesn't necessarily fit the next.
  let historyFilter: HistoryFilter = "both"

  // The Components tab's gating (§11.1, §17) — also what the History tab
  // reuses (task 0027): both require componentTree.enabled + mode "full" +
  // captureState, so this is computed once and shared rather than duplicated.
  const computeGating = (): ComponentTreeGating => ({
    enabled: options.componentTree.enabled,
    fullMode: (hook?.getMode() ?? "source") === "full",
    captureAttrs: options.componentTree.captureAttrs,
    captureState: options.componentTree.captureState,
  })

  // Record a new history snapshot for the watched component when a batched
  // components-updated event (§9.4) reports it redrew — pulled fresh via
  // `hook.statePreview`/`attrsPreview` rather than read off the patch, since
  // the runtime never puts attrs/state on the patch itself (task 0027).
  // State and attrs are gated independently (task 0027 follow-up: attrs
  // history) so an attrs-only presentational component still gets a
  // timeline even with `captureState` off, and vice versa.
  const recordHistoryFromEvent = (event: RuntimeEvent): void => {
    if (event.type !== "components-updated") return
    const watchedId = historyStore.getWatchedComponent()
    if (watchedId === null) return
    if (!event.records.some((patch) => patch.id === watchedId)) return
    const gating = computeGating()
    if (!gating.enabled || !gating.fullMode) return
    if (!gating.captureState && !gating.captureAttrs) return
    historyStore.record(
      watchedId,
      gating.captureState ? hook?.statePreview(watchedId) ?? null : null,
      gating.captureAttrs ? hook?.attrsPreview(watchedId) ?? null : null,
      Date.now(),
    )
  }

  // Switch the watched component and, on an actual change, seed the buffer
  // with its *current* attrs/state right away — `statePreview`/`attrsPreview`
  // read the values the runtime already keeps current every redraw, so
  // selecting a component shows them immediately instead of waiting for the
  // next redraw to populate the buffer via `recordHistoryFromEvent`.
  const watchComponent = (id: ComponentId | null): void => {
    const changed = id !== historyStore.getWatchedComponent()
    historyStore.setWatchedComponent(id)
    if (!changed) return
    historyFilter = "both" // a filter tuned to the old component's shape may not fit the new one
    if (id === null) return
    const gating = computeGating()
    if (!gating.enabled || !gating.fullMode) return
    if (!gating.captureState && !gating.captureAttrs) return
    historyStore.record(
      id,
      gating.captureState ? hook?.statePreview(id) ?? null : null,
      gating.captureAttrs ? hook?.attrsPreview(id) ?? null : null,
      Date.now(),
    )
  }

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
          recordHistoryFromEvent(event)
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
  // Local UI expand/collapse state (task: devtools-style compact preview),
  // reset alongside the fetch overrides above whenever the selection changes.
  let expandedAttrsPaths = new Set<string>()
  let expandedStatePaths = new Set<string>()
  const resetPreviewOverrides = (): void => {
    attrsOverrides = new Map()
    stateOverrides = new Map()
    expandedAttrsPaths = new Set()
    expandedStatePaths = new Set()
  }

  const persist = (): void => {
    saveOverlayState(
      {
        collapsed,
        activeTab,
        treeSearch: treeStore.getSearch(),
        pickerShortcuts: shortcutSettings,
        showPickingBanner: showBanner,
        redrawFlashEnabled,
        theme,
        extraRedactKeys: addedRedactionKeys,
      },
      storage,
    )
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
        key: record.key,
        mounted: record.mounted,
        choices: computeChoices(record),
        renderDuration: record.renderDuration,
        slowRenderCount: record.slowRenderCount,
      }))
      const selectedComponentChoices = ancestry.length > 0 ? ancestry[ancestry.length - 1]!.choices : []

      const gating: ComponentTreeGating = computeGating()
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
        expandedAttrsPaths,
        expandedStatePaths,
      }
      // task 0027 follow-up: only offer a source the component ever actually
      // populated — a component with no attrs (or no state) shouldn't get a
      // toggle between "something" and "always empty".
      const historyEntries = historyStore.entries()
      const hasStateData = hasMeaningfulHistoryData(historyEntries, "state")
      const hasAttrsData = hasMeaningfulHistoryData(historyEntries, "attrs")
      const availableSources: HistorySource[] = []
      if (hasStateData) availableSources.push("state")
      if (hasAttrsData) availableSources.push("attrs")
      const sources: readonly HistorySource[] =
        historyFilter === "both" ? availableSources : availableSources.filter((source) => source === historyFilter)
      const history: HistoryViewState = {
        gating,
        watchedComponentId: historyStore.getWatchedComponent(),
        entries: historyEntries,
        selectedEntryId: historyStore.getSelectedEntryId(),
        diff: historyStore.selectedDiff().filter((entry) => sources.includes(entry.source)),
        filter: historyFilter,
        hasStateData,
        hasAttrsData,
        sources,
      }

      return {
        picker: picker.getState(),
        picking: picker.isPicking(),
        collapsed,
        activeTab,
        hover,
        hoverRects,
        selection: snapshot,
        selectedComponentName: componentNameOf(snapshot.componentId),
        ancestry,
        selectedComponentChoices,
        focusedAncestorId,
        frozenRects,
        flashes: Array.from(flashesById, ([componentId, { rects, seq }]) => ({ componentId, seq, rects })),
        diagnostics: diagnostics.list(),
        componentTree,
        history,
        pickerShortcuts: shortcutSettings,
        showPickingBanner: showBanner,
        pickingBannerVisible: picker.isPicking() && showBanner && !bannerDismissed,
        redrawFlashEnabled,
        theme,
        redactionEnabled: hook?.getRedactionEnabled() ?? true,
        redactionKeys: hook?.getRedactionKeys() ?? [],
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
      // Checked ahead of the pass-through modifier below: if both ever share
      // the same key, opening the editor wins over passing the click through.
      const openDirectly = isModifierHeld(event, effectiveShortcutString("openEditorModifier"))
      // Pass-through modifier lets the application click proceed (§8.7).
      if (!openDirectly && isModifierHeld(event, effectiveShortcutString("passThroughModifier"))) return false

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
          watchComponent(data.componentId)
          collapsed = false // show the details panel (§8.7)
          // The merged tree/detail view is where a pick's result shows (§8.3)
          // — but the History tab also reflects the newly-watched component
          // (via `watchComponent` above), so a pick started from there should
          // land back on History, not get yanked over to Components. Settings
          // has no equivalent, so that's the only tab a pick still redirects.
          if (activeTab === "settings") activeTab = "components"
          persist()

          if (options.picker.openOnClick || openDirectly) controller.openSelectedInEditor()

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
            // Escape with nothing to cancel collapses the docked panel back
            // to the toggle (§8.1) — the same destination the "M" logo
            // click reaches, just without having to find it first.
            if (!collapsed) {
              event.preventDefault()
              controller.setCollapsed(true)
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

    recordDomMutations(records) {
      if (!redrawFlashEnabled || hook === null || hook === undefined || hook.getMode() !== "full") return
      diagnostics.guard(
        "redraw-flash",
        () => {
          const ids = componentsWithMutatedDom(records, (node) => hook.resolveDomComponent(node))
          let changed = false
          for (const id of ids) {
            const range = hook.componentRecord(id)?.domRange ?? null
            const rects = range === null ? [] : rectsOfDomRange(range)
            if (rects.length === 0) continue
            const existing = flashesById.get(id)
            if (existing !== undefined) clearTimeout(existing.timer)
            nextFlashSeq += 1
            flashesById.set(id, {
              rects,
              seq: nextFlashSeq,
              timer: setTimeout(() => {
                flashesById.delete(id)
                redraw()
              }, REDRAW_FLASH_DURATION_MS),
            })
            changed = true
          }
          if (changed) redraw()
          return undefined
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
      watchComponent(null)
      redraw()
    },

    promoteStaleSelection() {
      focusedAncestorId = null
      resetPreviewOverrides()
      if (selection.promoteToNearestAncestor()) {
        watchComponent(selection.snapshot().componentId)
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
          watchComponent(id)
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
          // A round-trip fetch is an explicit "show me this" request, so the
          // freshly-resolved container opens straight to its expanded rows —
          // unlike a container whose data was already available locally,
          // which starts collapsed behind the compact preview (see
          // `togglePreviewExpanded`).
          if (target === "attrs") {
            attrsOverrides.set(key, node)
            expandedAttrsPaths.add(key)
          } else {
            stateOverrides.set(key, node)
            expandedStatePaths.add(key)
          }
          redraw()
        },
        undefined,
      )
    },

    togglePreviewExpanded(target, path) {
      const key = pathKey(path)
      const set = target === "attrs" ? expandedAttrsPaths : expandedStatePaths
      if (set.has(key)) set.delete(key)
      else set.add(key)
      redraw()
    },

    // --- History tab: state-history panel (task 0027) -----------------------
    selectHistoryEntry(id) {
      historyStore.selectEntry(id)
      redraw()
    },
    setHistoryFilter(filter) {
      historyFilter = filter
      redraw()
    },

    // --- Settings tab: live picker shortcut editing -------------------------
    setPickerShortcutValue(key, value) {
      shortcutSettings = { ...shortcutSettings, [key]: { value, enabled: shortcutSettings[key].enabled } }
      shortcuts = computeShortcuts()
      persist()
      redraw()
    },
    setPickerShortcutEnabled(key, enabled) {
      shortcutSettings = { ...shortcutSettings, [key]: { value: shortcutSettings[key].value, enabled } }
      shortcuts = computeShortcuts()
      persist()
      redraw()
    },
    resetPickerShortcut(key) {
      shortcutSettings = {
        ...shortcutSettings,
        [key]: { value: options.picker[key], enabled: parseShortcut(options.picker[key]) !== null },
      }
      shortcuts = computeShortcuts()
      persist()
      redraw()
    },
    setShowPickingBanner(show) {
      showBanner = show
      persist()
      redraw()
    },
    setRedrawFlashEnabled(enabled) {
      redrawFlashEnabled = enabled
      persist()
      redraw()
    },
    setTheme(next) {
      theme = next
      persist()
      redraw()
    },
    resetTheme() {
      theme = options.theme
      persist()
      redraw()
    },
    setRedactionEnabled(enabled) {
      hook?.setRedactionEnabled(enabled)
      redraw()
    },
    addRedactionKey(key) {
      const trimmed = key.trim()
      if (trimmed.length === 0) return
      hook?.addRedactionKey(trimmed)
      if (!addedRedactionKeys.some((k) => k.toLowerCase() === trimmed.toLowerCase())) {
        addedRedactionKeys = [...addedRedactionKeys, trimmed]
      }
      persist()
      redraw()
    },

    dispose() {
      unsubscribeTree?.()
      clearBannerTimer()
      for (const { timer } of flashesById.values()) clearTimeout(timer)
      flashesById.clear()
    },
  }

  return controller
}
