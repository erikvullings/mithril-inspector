/** The name webpack/Rspack assign to a string/array `entry` with no explicit key. */
const DEFAULT_ENTRY_NAME = "main"

export interface EntryNamesResolution {
  /** Entry names the overlay/runtime bootstrap should be injected into via `EntryPlugin`. */
  readonly names: readonly string[]
  /** `true` when `entry` is a function (dynamic entry) — not auto-injectable (§25.9: documented, not silently dropped). */
  readonly dynamic: boolean
}

/**
 * Read (never mutate) the configured `entry` to find which entry names the
 * overlay bootstrap must be added to. Rspack explicitly forbids mutating
 * `compiler.options.entry` after the compiler is constructed — the sanctioned
 * replacement (on both webpack and Rspack) is `EntryPlugin(context, request,
 * name).apply(compiler)` per existing entry name, which is why this only
 * resolves *names* rather than producing a new entry config.
 *
 * Typed `unknown` rather than webpack's own `Configuration["entry"]` /
 * `EntryNormalized`: by the time a plugin's `apply(compiler)` runs,
 * `compiler.options.entry` is already normalized to the object-or-function
 * shape, while a raw user config may still be a bare string/array — this
 * only ever branches on the runtime shape, so it accepts either uniformly.
 */
export function resolveEntryNames(entry: unknown): EntryNamesResolution {
  if (typeof entry === "function") return { names: [], dynamic: true }
  if (entry === undefined || entry === null || typeof entry === "string" || Array.isArray(entry)) {
    return { names: [DEFAULT_ENTRY_NAME], dynamic: false }
  }
  return { names: Object.keys(entry), dynamic: false }
}
