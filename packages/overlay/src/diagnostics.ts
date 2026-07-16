/**
 * Overlay-side error collection (§16). The inspector must never break the host
 * app, so overlay operations run through {@link DiagnosticsLog.guard}: a thrown
 * error is caught, recorded, and the caller gets a fallback value. Recorded
 * diagnostics surface in the Settings panel's diagnostics view (§8.3, §16).
 */

export interface Diagnostic {
  readonly feature: string
  readonly message: string
  readonly time: number
}

export interface DiagnosticsLog {
  /** Record an error against a feature. */
  record(feature: string, error: unknown): void
  /** Run `fn`, returning its result; on throw, record and return `fallback`. */
  guard<T>(feature: string, fn: () => T, fallback: T): T
  list(): readonly Diagnostic[]
  count(): number
  clear(): void
  onChange(listener: () => void): () => void
}

export interface DiagnosticsOptions {
  readonly now?: () => number
  readonly debug?: boolean
  /** Maximum retained diagnostics (ring buffer); older entries are dropped. */
  readonly max?: number
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  if (typeof error === "string") return error
  try {
    return String(error)
  } catch {
    return "Unknown error"
  }
}

export function createDiagnostics(options: DiagnosticsOptions = {}): DiagnosticsLog {
  const now = options.now ?? Date.now
  const max = options.max ?? 100
  const debug = options.debug ?? false
  const entries: Diagnostic[] = []
  const listeners = new Set<() => void>()
  const loggedFeatures = new Set<string>()

  const notify = (): void => {
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // A misbehaving listener must not cascade into the host page.
      }
    }
  }

  const record = (feature: string, error: unknown): void => {
    entries.push({ feature, message: messageOf(error), time: now() })
    if (entries.length > max) entries.splice(0, entries.length - max)
    if (debug && !loggedFeatures.has(feature)) {
      loggedFeatures.add(feature)
      // Log once per feature in debug mode (§16); guarded so it never throws.
      try {
        console.warn(`[mithril-inspector] ${feature}:`, error)
      } catch {
        /* ignore */
      }
    }
    notify()
  }

  return {
    record,
    guard(feature, fn, fallback) {
      try {
        return fn()
      } catch (error) {
        record(feature, error)
        return fallback
      }
    },
    list() {
      return entries.slice()
    },
    count() {
      return entries.length
    },
    clear() {
      if (entries.length === 0) return
      entries.length = 0
      notify()
    },
    onChange(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
