import { getRuntime } from "./runtime.js"

/** Options for the explicit {@link inspectComponent} API (§14). */
export interface InspectComponentOptions {
  /** Explicit display name (highest precedence, §9.2). */
  readonly name?: string
  /** Source hint such as `import.meta.url` (reserved; unused in Phase 1). */
  readonly source?: string
}

/**
 * Explicitly instrument a component for applications with uncommon patterns the
 * transform cannot reach (§14). Equivalent to the transform's `__miComponent`
 * but with an explicit name; returns the instrumented definition.
 */
export function inspectComponent<T>(def: T, options: InspectComponentOptions = {}): T {
  const runtime = getRuntime()
  if (options.name !== undefined && def !== null && (typeof def === "object" || typeof def === "function")) {
    runtime.setInspectorDisplayName(def as object, options.name)
  }
  return runtime.component("", def)
}

/**
 * Explicitly attach a source marker to a vnode (§14). Reserved for Phase 1:
 * without a transform-provided source id there is nothing to resolve, so the
 * vnode is returned unchanged. Kept for API stability.
 */
export function inspectSource<T>(vnode: T): T {
  return vnode
}

/** Set an explicit display name for a component definition (§9.2, §14). */
export function setInspectorDisplayName(def: object, name: string): void {
  getRuntime().setInspectorDisplayName(def, name)
}

/** Hide a component definition from the inspector's component tree (§14). */
export function markInspectorHidden(def: object): void {
  getRuntime().markInspectorHidden(def)
}

/** Attach an attrs/state redaction serializer to a component (§14, §15). */
export function setInspectorSerializer(def: object, serializer: unknown): void {
  getRuntime().setInspectorSerializer(def, serializer)
}
