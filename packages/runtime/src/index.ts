import type { ModuleId } from "@mithril-inspector/protocol"

import { getRuntime } from "./runtime.js"
import type { InspectorRuntime } from "./runtime.js"
import type { ModuleRegistrationInput } from "./source-registry.js"

export const packageName = "@mithril-inspector/runtime" as const

// ============================================================================
// Transform-facing entry points (§6.1). The build-time transform injects
//   import { registerModule as __miRegisterModule,
//            source as __miSource,
//            component as __miComponent } from "@mithril-inspector/runtime"
// so these three names and signatures are a stable contract with the transform.
// ============================================================================

/** Install (or HMR-replace) a module's source table (`__miRegisterModule`). */
export function registerModule(moduleId: ModuleId, registration: ModuleRegistrationInput): void {
  getRuntime().registerSourceModule(moduleId, registration)
}

/** Stamp a vnode with a qualified source id and queue association (`__miSource`). */
export function source<T>(qualifiedId: string, vnode: T): T {
  return getRuntime().source(qualifiedId, vnode)
}

/** Instrument a component definition at its definition site (`__miComponent`). */
export function component<T>(qualifiedId: string, def: T): T {
  return getRuntime().component(qualifiedId, def)
}

// ============================================================================
// Overlay / consumer entry points.
// ============================================================================

/** The runtime hook object (also installed at `window.__MITHRIL_INSPECTOR__`). */
export function getInspectorHook(): InspectorRuntime {
  return getRuntime()
}

export {
  inspectComponent,
  inspectSource,
  markInspectorHidden,
  setInspectorDisplayName,
  setInspectorSerializer,
} from "./api.js"
export type { InspectComponentOptions } from "./api.js"

export { createRuntime, DEFAULT_REDACTION_REPLACEMENT, getRuntime, RUNTIME_VERSION } from "./runtime.js"
export type { InspectorMode, InspectorRuntime, RedactionConfig, RuntimeOptions } from "./runtime.js"

export { createSourceRegistry } from "./source-registry.js"
export type {
  ModuleRegistrationInput,
  SourceKind,
  SourceRecordInput,
  SourceRegistry,
} from "./source-registry.js"

export { createDomAssociationRegistry } from "./dom-association.js"
export type { DomAssociationRegistry, DomOwnership } from "./dom-association.js"

export { createComponentRegistry } from "./components.js"
export type { ComponentRegistry, ComponentRegistryOptions } from "./components.js"

export { domRangeOf } from "./dom-range.js"
export type { DomRange } from "./dom-range.js"
