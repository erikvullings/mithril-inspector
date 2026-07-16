/**
 * localStorage persistence for the overlay's position and collapsed state
 * (§8.1). All access is guarded: private-mode browsers throw on
 * `localStorage`, and the overlay must never break the host page (§16), so a
 * failure degrades to in-memory defaults.
 */

export interface OverlayPersistedState {
  /** Whether the panel is collapsed to the bottom tab. */
  collapsed?: boolean
  /** Absolute drag offset from the configured corner, or `null` if unmoved. */
  offset?: { x: number; y: number } | null
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
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

  const offset = record.offset
  if (offset === null) {
    state.offset = null
  } else if (typeof offset === "object") {
    const point = offset as Record<string, unknown>
    if (isFiniteNumber(point.x) && isFiniteNumber(point.y)) {
      state.offset = { x: point.x, y: point.y }
    }
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
