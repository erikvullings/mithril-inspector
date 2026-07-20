import type {
  ComponentId,
  ComponentRecord,
  InspectorListener,
  InspectorSnapshot,
  PreviewNode,
  PreviewPath,
  SourceLocation,
} from "@mithril-inspector/protocol"

/**
 * Local mirror of the runtime's `InspectorMode` (§17) — not imported, so the
 * overlay stays decoupled from `@mithril-inspector/runtime` (only a
 * devDependency, used for the compile-time hook-shape assertion below).
 */
export type OverlayInspectorMode = "source" | "components" | "full"

/** Local mirror of the runtime serializer's `ExpandOptions` (§7.4, task 0020). */
export interface ExpandPreviewOptions {
  /** Page start for a container's `entries`/`items` (default 0). */
  readonly offset?: number
}

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
  /** A strong snapshot of every currently-tracked record (§9.4, task 0021); the tree's initial seed. */
  getSnapshot(): InspectorSnapshot
  /** Subscribe to batched `RuntimeEvent`s (§9.4); returns an unsubscribe function. */
  subscribe(listener: InspectorListener): () => void
  /** The runtime's active performance/feature mode (§17) — attrs/state require `"full"`. */
  getMode(): OverlayInspectorMode
  /** Whether attrs/state redaction is currently active (§15, Settings tab toggle) — session-only, always `true` right after a fresh page load. */
  getRedactionEnabled(): boolean
  /** Turn attrs/state redaction on/off (§15, Settings tab) — never persisted; see {@link getRedactionEnabled}. */
  setRedactionEnabled(enabled: boolean): void
  /** The full active set of redacted key patterns (§15, Settings tab display). */
  getRedactionKeys(): readonly string[]
  /** Add one more key pattern to redact (§15, Settings tab) — the overlay persists it across reloads and replays it here on mount. */
  addRedactionKey(key: string): void
  /** The lazy, redacted attrs preview tree for an instance (§7.4, §15, task 0020), or `null`. */
  attrsPreview(id: ComponentId): PreviewNode | null
  /** The lazy, redacted state preview tree for an instance (§7.4, §15, task 0020), or `null`. */
  statePreview(id: ComponentId): PreviewNode | null
  /** Evaluate a deferred getter, page a container, or expand a `max-depth` stub (§7.4). */
  expandPreview(
    id: ComponentId,
    target: "attrs" | "state",
    path: PreviewPath,
    options?: ExpandPreviewOptions,
  ): PreviewNode | null
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
    typeof hook.excludeHost === "function" &&
    typeof hook.getSnapshot === "function" &&
    typeof hook.subscribe === "function"
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
