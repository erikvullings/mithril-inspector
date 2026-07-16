/**
 * Overlay configuration (§8, §11.1 `ui`/`picker`). All fields have defaults so
 * the overlay boots with zero configuration; every value here is UI/behavioral
 * and carries no bundler or Vite coupling.
 */

export type OverlayPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left"
export type OverlayTheme = "system" | "light" | "dark"

export interface PickerOptions {
  readonly enabled: boolean
  /** Sticky toggle chord (§8.4). Empty/"none" disables it (§18). */
  readonly toggleShortcut: string
  /** Momentary modifier-only hold (§8.4). */
  readonly holdShortcut: string
  /** Open the current source (§8.4, default `Enter`). */
  readonly openShortcut: string
  /** Cancel the picker (§8.4, default `Escape`). */
  readonly cancelShortcut: string
  /** Select on click while picking (§8.7). */
  readonly openOnClick: boolean
  /** Stay in picker mode after a selection (§8.7). */
  readonly continuous: boolean
  /** Hold this modifier to let the application click pass through (§8.7). */
  readonly passThroughModifier: string
}

export interface OverlayOptions {
  readonly enabled: boolean
  readonly position: OverlayPosition
  /** Start expanded rather than collapsed to the tab (§8.1). */
  readonly defaultOpen: boolean
  readonly theme: OverlayTheme
  readonly zIndex: number
  /** Attach a closed shadow root instead of the default open one (§8.2). */
  readonly closedShadowRoot: boolean
  readonly picker: PickerOptions
}

export type DeepPartial<T> = {
  [K in keyof T]?: (T[K] extends object ? DeepPartial<T[K]> : T[K]) | undefined
}

export type OverlayOptionsInput = DeepPartial<OverlayOptions>

export const DEFAULT_PICKER_OPTIONS: PickerOptions = {
  enabled: true,
  toggleShortcut: "Alt+Shift+M",
  holdShortcut: "Alt+Shift",
  openShortcut: "Enter",
  cancelShortcut: "Escape",
  openOnClick: true,
  continuous: false,
  // Meta (Cmd/Win) is distinct from the Alt+Shift picker modifiers, so it works
  // as a pass-through in both sticky and hold modes.
  passThroughModifier: "Meta",
}

export const DEFAULT_OVERLAY_OPTIONS: OverlayOptions = {
  enabled: true,
  position: "bottom-right",
  defaultOpen: false,
  theme: "system",
  // Just below the 32-bit signed max so the overlay sits above typical app UI
  // without silently clamping.
  zIndex: 2_147_483_000,
  closedShadowRoot: false,
  picker: DEFAULT_PICKER_OPTIONS,
}

/** Merge partial input over the defaults, resolving the nested picker block. */
export function resolveOverlayOptions(input: OverlayOptionsInput = {}): OverlayOptions {
  const { picker: pickerInput, ...rest } = input
  return {
    ...DEFAULT_OVERLAY_OPTIONS,
    ...omitUndefined(rest),
    picker: { ...DEFAULT_PICKER_OPTIONS, ...omitUndefined(pickerInput ?? {}) },
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
