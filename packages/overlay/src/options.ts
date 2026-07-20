/**
 * Overlay configuration (§8, §11.1 `ui`/`picker`). All fields have defaults so
 * the overlay boots with zero configuration; every value here is UI/behavioral
 * and carries no bundler or Vite coupling.
 */

export type OverlayTheme = "system" | "light" | "dark"

export interface PickerOptions {
  readonly enabled: boolean
  /** Sticky toggle chord (§8.4). Empty/"none" disables it (§18). */
  readonly toggleShortcut: string
  /** Momentary modifier-only hold (§8.4) — a single key since this is the picker's most-used gesture. */
  readonly holdShortcut: string
  /** Open the current source (§8.4, default `Enter`). */
  readonly openShortcut: string
  /** Cancel the picker (§8.4, default `Escape`). */
  readonly cancelShortcut: string
  /**
   * Open the editor immediately on a picker click (§8.7). Off by default —
   * a pick should land the result in the docked panel (breadcrumb, attrs,
   * state) in place; jumping to the editor is a separate, explicit action
   * (the toolbar's "Open in editor" icon) rather than an automatic side
   * effect of selecting.
   */
  readonly openOnClick: boolean
  /** Stay in picker mode after a selection (§8.7). */
  readonly continuous: boolean
  /**
   * Hold this modifier to let the application click pass through (§8.7) — a
   * rarer, more deliberate escape hatch than the hold-to-pick gesture above,
   * so it gets the compound combo while hold-to-pick keeps the single key.
   */
  readonly passThroughModifier: string
  /**
   * Hold this modifier while clicking during picking to select the element
   * *and* immediately open it in the editor — checked ahead of
   * `passThroughModifier` below, so if both are ever configured to the same
   * key, opening wins. Defaults to Meta (Cmd/Win): Ctrl can't be the default
   * here because macOS intercepts Ctrl+Click as a secondary click (it opens
   * the native context menu before any `click` event reaches the page at
   * all), so Meta is the one modifier that reliably reaches this handler on
   * every platform.
   */
  readonly openEditorModifier: string
  /**
   * Show the "Inspecting…" banner while picking (§18). It auto-hides itself
   * a few seconds after each fresh pick session starts (the toggle/crosshair
   * icon's own active styling still indicates picking is on) — this only
   * turns it off entirely, e.g. because it sits over the host page's own
   * fixed UI. Live-toggleable from the Settings tab.
   */
  readonly showBanner: boolean
}

/**
 * Phase-3 component tree feature toggles (§11.1 `componentTree`, §17). The
 * Vite adapter's own resolver (`ResolvedComponentTreeOptions`) defaults
 * `enabled` to `false` for existing apps that haven't opted in; the overlay
 * package's own standalone default is permissive (`true`) so the tree just
 * works when the package is used directly (tests, non-Vite hosts).
 */
export interface ComponentTreeOptions {
  /** Show the real component tree in the Components tab; `false` keeps the Phase 1/2 placeholder. */
  readonly enabled: boolean
  /** Fetch/display the lazy attrs preview (§7.4) in a selected component's details; also requires `mode: "full"`. */
  readonly captureAttrs: boolean
  /** Fetch/display the lazy state preview (§7.4) in a selected component's details; also requires `mode: "full"`. */
  readonly captureState: boolean
}

/**
 * Redraw-flash visualization (task 0030, REQUIREMENTS.md §21 Phase 5): a
 * brief highlight over a component's DOM range when its own DOM actually
 * mutated this redraw — not merely when its `view()` ran. Off by default,
 * unlike {@link ComponentTreeOptions}'s permissive package-level default:
 * task 0026's own acceptance criterion requires this whole diagnostics
 * category to be opt-in. Also requires `mode: "full"` (checked live against
 * the runtime hook, not duplicated here) — this flag alone only controls
 * whether the overlay is even willing to install its `MutationObserver`.
 */
export interface RedrawFlashOptions {
  readonly enabled: boolean
}

export interface OverlayOptions {
  readonly enabled: boolean
  /** Start expanded to the docked panel rather than collapsed to the toggle (§8.1). */
  readonly defaultOpen: boolean
  readonly theme: OverlayTheme
  readonly zIndex: number
  /** Attach a closed shadow root instead of the default open one (§8.2). */
  readonly closedShadowRoot: boolean
  readonly picker: PickerOptions
  readonly componentTree: ComponentTreeOptions
  readonly redrawFlash: RedrawFlashOptions
  /** Rolling buffer size for the State History tab (task 0027) — oldest snapshots drop once exceeded. */
  readonly historyLimit: number
  /**
   * The editor command the open-in-editor endpoint will launch (§10.3),
   * shown read-only in the Settings tab. The overlay never lets the user
   * change this from the browser — §10.2 forbids the client from choosing
   * what the server runs; override it via the `editor` option or an
   * `MITHRIL_INSPECTOR_EDITOR`/`LAUNCH_EDITOR`/`VISUAL`/`EDITOR` env var instead.
   */
  readonly editorCommand: string
}

export type DeepPartial<T> = {
  [K in keyof T]?: (T[K] extends object ? DeepPartial<T[K]> : T[K]) | undefined
}

export type OverlayOptionsInput = DeepPartial<OverlayOptions>

export const DEFAULT_PICKER_OPTIONS: PickerOptions = {
  enabled: true,
  toggleShortcut: "Alt+Shift+M",
  // A single key: the most-used picker gesture gets the simplest one to hold.
  holdShortcut: "Alt",
  openShortcut: "Enter",
  cancelShortcut: "Escape",
  openOnClick: false,
  continuous: false,
  // The compound combo: pass-through is a rarer, deliberate escape hatch, so
  // it takes the two-key combo the hold-to-pick gesture gave up. Distinct
  // from openEditorModifier's default (Meta) so neither shadows the other.
  passThroughModifier: "Alt+Shift",
  openEditorModifier: "Meta",
  showBanner: true,
}

export const DEFAULT_COMPONENT_TREE_OPTIONS: ComponentTreeOptions = {
  enabled: true,
  captureAttrs: true,
  captureState: true,
}

export const DEFAULT_REDRAW_FLASH_OPTIONS: RedrawFlashOptions = {
  enabled: false,
}

export const DEFAULT_OVERLAY_OPTIONS: OverlayOptions = {
  enabled: true,
  defaultOpen: false,
  theme: "system",
  // Just below the 32-bit signed max so the overlay sits above typical app UI
  // without silently clamping.
  zIndex: 2_147_483_000,
  closedShadowRoot: false,
  picker: DEFAULT_PICKER_OPTIONS,
  componentTree: DEFAULT_COMPONENT_TREE_OPTIONS,
  redrawFlash: DEFAULT_REDRAW_FLASH_OPTIONS,
  historyLimit: 50,
  editorCommand: "code",
}

/** Merge partial input over the defaults, resolving the nested picker/componentTree blocks. */
export function resolveOverlayOptions(input: OverlayOptionsInput = {}): OverlayOptions {
  const { picker: pickerInput, componentTree: componentTreeInput, redrawFlash: redrawFlashInput, ...rest } = input
  return {
    ...DEFAULT_OVERLAY_OPTIONS,
    ...omitUndefined(rest),
    picker: { ...DEFAULT_PICKER_OPTIONS, ...omitUndefined(pickerInput ?? {}) },
    componentTree: { ...DEFAULT_COMPONENT_TREE_OPTIONS, ...omitUndefined(componentTreeInput ?? {}) },
    redrawFlash: { ...DEFAULT_REDRAW_FLASH_OPTIONS, ...omitUndefined(redrawFlashInput ?? {}) },
  }
}

type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> }

/** Drop keys whose value is `undefined` so they don't clobber defaults. */
function omitUndefined<T extends object>(value: T): Defined<T> {
  const out: Defined<T> = {}
  for (const key of Object.keys(value) as (keyof T)[]) {
    const current = value[key]
    if (current !== undefined) out[key] = current as Exclude<T[typeof key], undefined>
  }
  return out
}
