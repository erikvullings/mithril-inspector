import type { ModuleId } from "@mithril-inspector/protocol"

/**
 * Wire-protocol constant for the HMR invalidation channel embedded into the
 * generated runtime bootstrap module (ADR-106): the event name a dev-server
 * adapter pushes to the browser when an instrumented module is replaced, and
 * the payload shape carried on it. Bundler-neutral by itself — an adapter
 * with real HMR (Vite) owns dispatching it; one without (Rollup's watch mode
 * has no fine-grained HMR) simply never sends it.
 */
export const HMR_INVALIDATE_EVENT = "mithril-inspector:invalidate"

/** The payload of an {@link HMR_INVALIDATE_EVENT} message. */
export interface HmrInvalidatePayload {
  readonly moduleIds: readonly ModuleId[]
}
