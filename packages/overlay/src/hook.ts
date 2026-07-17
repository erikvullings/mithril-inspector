import type { ComponentId, ComponentRecord, SourceLocation } from "@mithril-inspector/protocol"

/**
 * The subset of the runtime hook (`window.__MITHRIL_INSPECTOR__`, §7.1) that the
 * overlay consumes. The overlay reads the global at runtime rather than
 * importing the runtime package, keeping it decoupled and independently
 * testable with a fake hook. The shape is a structural subset of the runtime's
 * `InspectorRuntime`; a compile-time assertion in the tests guards against
 * drift.
 */
export interface OverlayHook {
  /** Nearest source location for a DOM node, or `null` (the picker path, §8.5). */
  resolveDomSource(node: Node): SourceLocation | null
  /** Nearest component instance owning a DOM node, or `null`. */
  resolveDomComponent(node: Node): ComponentId | null
  /** A fresh component record for an instance id, or `undefined`. */
  componentRecord(id: ComponentId): ComponentRecord | undefined
  /** Root-first ancestor chain for an instance, including itself (§9.1, §19.2.6, task 0019); `[]` if unknown. */
  componentAncestry(id: ComponentId): ComponentRecord[]
  /** The component's `component-view` source location (§9.3), or `null` when none exists. */
  componentViewSource(id: ComponentId): SourceLocation | null
  /** Source stamped on a specific vnode, or `null`. */
  sourceOfVnode(vnode: object): SourceLocation | null
  /** Exclude the overlay host (and subtree) from tracking (§8.2). */
  excludeHost(host: Node): void
  /** Force the runtime's batched DOM-association flush (used before resolving). */
  flush(): void
}

const GLOBAL_KEY = "__MITHRIL_INSPECTOR__"

interface HookScope {
  [GLOBAL_KEY]?: unknown
}

function looksLikeHook(candidate: unknown): candidate is OverlayHook {
  if (typeof candidate !== "object" || candidate === null) return false
  const hook = candidate as Record<string, unknown>
  return (
    typeof hook.resolveDomSource === "function" &&
    typeof hook.resolveDomComponent === "function" &&
    typeof hook.excludeHost === "function"
  )
}

/**
 * Read the installed runtime hook from a scope (default `globalThis`), or
 * `null` when the runtime is absent — e.g. a production build with the
 * instrumentation stripped (§2.1), where the overlay must stay inert.
 */
export function getOverlayHook(scope: HookScope = globalThis as HookScope): OverlayHook | null {
  const candidate = scope[GLOBAL_KEY]
  return looksLikeHook(candidate) ? candidate : null
}
