/**
 * localStorage persistence for the overlay's collapsed state, last active
 * section, and any picker shortcuts the user rebound from the Settings tab
 * (§8.1, §8.4). All access is guarded: private-mode browsers throw on
 * `localStorage`, and the overlay must never break the host page (§16), so a
 * failure degrades to in-memory defaults.
 */

import type { OverlayTheme } from "./options.js"
import { PICKER_SHORTCUT_KEYS, type PickerShortcutKey, type PickerShortcutSetting } from "./shortcuts.js"

/**
 * Local mirror of `OverlayTab` (`./controller.js`) — not imported, to avoid a
 * circular dependency (the controller already imports this module).
 */
type PersistedTab = "components" | "history" | "settings"

const PERSISTED_TABS: ReadonlySet<string> = new Set<PersistedTab>(["components", "history", "settings"])
const PICKER_SHORTCUT_KEY_SET: ReadonlySet<string> = new Set(PICKER_SHORTCUT_KEYS)
const PERSISTED_THEMES: ReadonlySet<string> = new Set<OverlayTheme>(["system", "light", "dark"])

export interface OverlayPersistedState {
  /** Whether the panel is collapsed to the bottom toggle. */
  collapsed?: boolean
  /**
   * The last active sidebar section (task 0022 follow-up): a Vite dev-server
   * WebSocket reconnect (e.g. after "Open in editor" backgrounds the tab long
   * enough for the browser to drop it) triggers a full page reload — Vite's
   * own behavior, not the overlay's — which would otherwise silently reset
   * back to the default section.
   */
  activeTab?: PersistedTab
  /** The component tree's search query; see {@link activeTab}. */
  treeSearch?: string
  /**
   * User-edited overrides for the picker's shortcuts/modifiers (Settings
   * tab), keyed by option name. A key absent here keeps the app-configured
   * default from `OverlayOptions.picker`.
   */
  pickerShortcuts?: Partial<Record<PickerShortcutKey, PickerShortcutSetting>>
  /** Whether to show the picking-active banner (§18, Settings tab); absent keeps the app-configured `picker.showBanner` default. */
  showPickingBanner?: boolean
  /** A user-picked theme override (Settings tab); absent keeps the app-configured `OverlayOptions.theme` default. */
  theme?: OverlayTheme
  /**
   * Extra attrs/state redaction key patterns added from the Settings tab
   * (§15), replayed onto the runtime hook on mount. Unlike the redaction
   * on/off toggle, these persist across reloads — they only ever narrow what
   * gets redacted, so persisting them can't leave secrets exposed.
   */
  extraRedactKeys?: readonly string[]
}

/** Validate one stored shortcut-setting entry, discarding anything malformed. */
function parsePickerShortcutSetting(value: unknown): PickerShortcutSetting | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const { value: rawValue, enabled } = value as Record<string, unknown>
  if (typeof rawValue !== "string" || typeof enabled !== "boolean") return undefined
  return { value: rawValue, enabled }
}

function parsePickerShortcuts(value: unknown): Partial<Record<PickerShortcutKey, PickerShortcutSetting>> | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const out: Partial<Record<PickerShortcutKey, PickerShortcutSetting>> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!PICKER_SHORTCUT_KEY_SET.has(key)) continue
    const setting = parsePickerShortcutSetting(entry)
    if (setting !== undefined) out[key as PickerShortcutKey] = setting
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export const OVERLAY_STORAGE_KEY = "__mithril-inspector-overlay"

/** Storage subset the overlay needs; satisfied by `window.localStorage`. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultStorage(): StorageLike | null {
  try {
    const candidate = (globalThis as { localStorage?: StorageLike }).localStorage
    return candidate ?? null
  } catch {
    // Accessing localStorage can throw in sandboxed iframes / disabled storage.
    return null
  }
}

/** Load persisted overlay state, returning `{}` on any error or malformed data. */
export function loadOverlayState(storage: StorageLike | null = defaultStorage()): OverlayPersistedState {
  if (storage === null) return {}
  let raw: string | null
  try {
    raw = storage.getItem(OVERLAY_STORAGE_KEY)
  } catch {
    return {}
  }
  if (raw === null) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== "object" || parsed === null) return {}

  const record = parsed as Record<string, unknown>
  const state: OverlayPersistedState = {}
  if (typeof record.collapsed === "boolean") state.collapsed = record.collapsed

  if (typeof record.activeTab === "string" && PERSISTED_TABS.has(record.activeTab)) {
    state.activeTab = record.activeTab as PersistedTab
  }
  if (typeof record.treeSearch === "string") state.treeSearch = record.treeSearch

  const pickerShortcuts = parsePickerShortcuts(record.pickerShortcuts)
  if (pickerShortcuts !== undefined) state.pickerShortcuts = pickerShortcuts

  if (typeof record.showPickingBanner === "boolean") state.showPickingBanner = record.showPickingBanner

  if (typeof record.theme === "string" && PERSISTED_THEMES.has(record.theme)) {
    state.theme = record.theme as OverlayTheme
  }

  if (Array.isArray(record.extraRedactKeys)) {
    const keys = record.extraRedactKeys.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    if (keys.length > 0) state.extraRedactKeys = keys
  }

  return state
}

/** Persist overlay state, silently ignoring storage failures (§16). */
export function saveOverlayState(
  state: OverlayPersistedState,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (storage === null) return
  try {
    storage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota exceeded / disabled storage — non-fatal.
  }
}
