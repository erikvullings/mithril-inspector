/**
 * Keyboard-shortcut parsing and matching for the picker (§8.4, §18).
 *
 * Shortcuts are configured as strings such as `"Alt+Shift+M"` (a chord that
 * fires on a key press) or `"Alt+Shift"` (a modifier-only *hold*). Every
 * shortcut is remappable and can be disabled by passing an empty/`"none"`
 * value (§18), which parses to `null`.
 */

export interface ShortcutSpec {
  readonly ctrl: boolean
  readonly alt: boolean
  readonly shift: boolean
  readonly meta: boolean
  /** Normalized (lower-cased) key, or `null` for a modifier-only hold. */
  readonly key: string | null
}

/** Modifier state read from a keyboard/pointer event. */
export interface ModifierState {
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly metaKey: boolean
}

const DISABLED_TOKENS = new Set(["", "none", "off", "disabled", "false"])

const MODIFIER_ALIASES: Record<string, keyof Omit<ShortcutSpec, "key">> = {
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  win: "meta",
  windows: "meta",
  super: "meta",
}

/**
 * Parse a shortcut string into a {@link ShortcutSpec}. Returns `null` when the
 * shortcut is disabled (empty, `"none"`, `"off"`, `"disabled"`), so callers can
 * treat `null` uniformly as "never matches".
 */
export function parseShortcut(text: string | null | undefined): ShortcutSpec | null {
  if (text === null || text === undefined) return null
  const trimmed = text.trim()
  if (DISABLED_TOKENS.has(trimmed.toLowerCase())) return null

  let ctrl = false
  let alt = false
  let shift = false
  let meta = false
  let key: string | null = null

  for (const rawToken of trimmed.split("+")) {
    const token = rawToken.trim()
    if (token === "") continue
    const modifier = MODIFIER_ALIASES[token.toLowerCase()]
    if (modifier !== undefined) {
      if (modifier === "ctrl") ctrl = true
      else if (modifier === "alt") alt = true
      else if (modifier === "shift") shift = true
      else meta = true
      continue
    }
    // Any non-modifier token is the key. If several appear, the last wins.
    key = normalizeKey(token)
  }

  return { ctrl, alt, shift, meta, key }
}

/** Normalize a key token or `KeyboardEvent.key` for case-insensitive matching. */
export function normalizeKey(key: string): string {
  return key.trim().toLowerCase()
}

/**
 * Whether a key-press event satisfies a chord shortcut. A `null` spec (disabled)
 * and a modifier-only spec (`key === null`) never match here — the latter is a
 * hold, matched with {@link matchesHold}.
 */
export function matchesShortcut(event: KeyboardEvent, spec: ShortcutSpec | null): boolean {
  if (spec === null || spec.key === null) return false
  return (
    event.ctrlKey === spec.ctrl &&
    event.altKey === spec.alt &&
    event.shiftKey === spec.shift &&
    event.metaKey === spec.meta &&
    normalizeKey(event.key) === spec.key
  )
}

/**
 * Whether the current modifier state exactly matches a modifier-only hold
 * shortcut. Extra modifiers break the match so holds don't fire under unrelated
 * chords. A `null` spec, or a spec that carries a key, never matches.
 */
export function matchesHold(event: ModifierState, spec: ShortcutSpec | null): boolean {
  if (spec === null || spec.key !== null) return false
  // A hold needs at least one modifier, else every keyup would "match".
  if (!spec.ctrl && !spec.alt && !spec.shift && !spec.meta) return false
  return (
    event.ctrlKey === spec.ctrl &&
    event.altKey === spec.alt &&
    event.shiftKey === spec.shift &&
    event.metaKey === spec.meta
  )
}

/**
 * Whether a single modifier name (e.g. the pass-through modifier, §8.7) is held.
 * Accepts the same aliases as {@link parseShortcut}; a disabled value is `false`.
 */
export function isModifierHeld(event: ModifierState, modifier: string | null | undefined): boolean {
  if (modifier === null || modifier === undefined) return false
  const trimmed = modifier.trim().toLowerCase()
  if (DISABLED_TOKENS.has(trimmed)) return false
  const resolved = MODIFIER_ALIASES[trimmed]
  if (resolved === undefined) return false
  if (resolved === "ctrl") return event.ctrlKey
  if (resolved === "alt") return event.altKey
  if (resolved === "shift") return event.shiftKey
  return event.metaKey
}
