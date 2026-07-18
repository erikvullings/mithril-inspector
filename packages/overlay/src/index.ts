export const packageName = "@mithril-inspector/overlay" as const

// --- Mount entry point ------------------------------------------------------
export { HOST_ID, mountInspectorOverlay } from "./overlay.js"
export type { OverlayHandle, OverlayMountDeps } from "./overlay.js"

// --- Options ----------------------------------------------------------------
export {
  DEFAULT_OVERLAY_OPTIONS,
  DEFAULT_PICKER_OPTIONS,
  resolveOverlayOptions,
} from "./options.js"
export type {
  DeepPartial,
  OverlayOptions,
  OverlayOptionsInput,
  OverlayTheme,
  PickerOptions,
} from "./options.js"

// --- Runtime hook adapter ---------------------------------------------------
export { getOverlayHook } from "./hook.js"
export type { OverlayHook } from "./hook.js"

// --- Controller (also usable headlessly by embedders) -----------------------
export { createOverlayController } from "./controller.js"
export type {
  ClickEvent,
  HoverInfo,
  OverlayController,
  OverlayControllerDeps,
  OverlayTab,
  OverlayViewState,
} from "./controller.js"

// --- View -------------------------------------------------------------------
export { OverlayRoot } from "./view.js"

// --- Building blocks (exported for tooling/tests) ---------------------------
export { describeMapping, formatFileLine } from "./mapping.js"
export type { MappingInfo, MappingPrecision } from "./mapping.js"
export { createEditorClient, OPEN_IN_EDITOR_PATH } from "./editor.js"
export type { EditorOpenResult, OpenInEditor } from "./editor.js"
export {
  boundingRect,
  createFrameScheduler,
  rectOfElement,
  rectsOfNodes,
} from "./highlight.js"
export type { FrameScheduler, HighlightRect, RafHost } from "./highlight.js"
export {
  createPickerMachine,
  initialPickerState,
  isPicking,
  pickerReducer,
} from "./picker.js"
export type { PickerAction, PickerActivation, PickerMachine, PickerPhase, PickerState } from "./picker.js"
export { createSelectionModel } from "./selection.js"
export type { SelectionData, SelectionModel, SelectionSnapshot } from "./selection.js"
export { createDiagnostics } from "./diagnostics.js"
export type { Diagnostic, DiagnosticsLog } from "./diagnostics.js"
export {
  isModifierHeld,
  matchesHold,
  matchesShortcut,
  parseShortcut,
} from "./shortcuts.js"
export type { ModifierState, ShortcutSpec } from "./shortcuts.js"
export { loadOverlayState, OVERLAY_STORAGE_KEY, saveOverlayState } from "./persistence.js"
export type { OverlayPersistedState, StorageLike } from "./persistence.js"
export { createComponentTreeStore } from "./tree.js"
export type { ComponentTreeStore, PinnedRow, TreeRow } from "./tree.js"
export { isExpandable, pathKey, summarizeNode } from "./preview.js"
