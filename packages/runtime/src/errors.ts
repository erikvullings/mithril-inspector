/**
 * The inspector must never break the host application because it failed (§16).
 * Every public entry point runs inside {@link ErrorBoundary.guard}: an
 * exception is caught and the caller's fallback returned, the failure is counted
 * per feature, and once a feature crosses a threshold it is disabled so the
 * inspector stops touching that path entirely — leaving normal Mithril
 * rendering intact.
 */
export interface ErrorBoundary {
  /**
   * Run `fn` under the named feature's boundary. Returns `fn()`; on throw (or if
   * the feature is already disabled) returns `fallback` without propagating.
   */
  guard<T>(feature: string, fn: () => T, fallback: T): T
  /** Whether a feature is still enabled (below its failure threshold). */
  isEnabled(feature: string): boolean
  /** Force a feature off. */
  disable(feature: string): void
  /** Re-enable every feature and clear failure counts. */
  reset(): void
}

export interface ErrorBoundaryOptions {
  /** Failures before a feature is disabled (default 5). */
  readonly threshold?: number
  /** Log the first failure of each feature to `console.error` (default false). */
  readonly debug?: boolean
  /** Invoked once when a feature is disabled. */
  readonly onDisable?: (feature: string) => void
}

interface FeatureState {
  failures: number
  enabled: boolean
  logged: boolean
}

export function createErrorBoundary(options: ErrorBoundaryOptions = {}): ErrorBoundary {
  const threshold = options.threshold ?? 5
  const debug = options.debug ?? false
  const onDisable = options.onDisable
  const states = new Map<string, FeatureState>()

  const stateOf = (feature: string): FeatureState => {
    let state = states.get(feature)
    if (state === undefined) {
      state = { failures: 0, enabled: true, logged: false }
      states.set(feature, state)
    }
    return state
  }

  return {
    guard<T>(feature: string, fn: () => T, fallback: T): T {
      const state = stateOf(feature)
      if (!state.enabled) return fallback
      try {
        return fn()
      } catch (error) {
        state.failures += 1
        if (debug && !state.logged) {
          state.logged = true
          // eslint-disable-next-line no-console
          console.error(`[mithril-inspector] "${feature}" feature error:`, error)
        }
        if (state.failures >= threshold && state.enabled) {
          state.enabled = false
          onDisable?.(feature)
        }
        return fallback
      }
    },
    isEnabled(feature) {
      return stateOf(feature).enabled
    },
    disable(feature) {
      const state = stateOf(feature)
      if (state.enabled) {
        state.enabled = false
        onDisable?.(feature)
      }
    },
    reset() {
      states.clear()
    },
  }
}
