/**
 * localStorage persistence for the overlay's collapsed state and last active
 * section (§8.1). All access is guarded: private-mode browsers throw on
 * `localStorage`, and the overlay must never break the host page (§16), so a
 * failure degrades to in-memory defaults.
 */

/**
 * Local mirror of `OverlayTab` (`./controller.js`) — not imported, to avoid a
 * circular dependency (the controller already imports this module).
 */
type PersistedTab = "components" | "settings"

const PERSISTED_TABS: ReadonlySet<string> = new Set<PersistedTab>(["components", "settings"])

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
