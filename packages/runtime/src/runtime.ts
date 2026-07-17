import type {
  ComponentId,
  ComponentRecord,
  DomAssociation,
  InspectorListener,
  InspectorSnapshot,
  MithrilInspectorHook,
  ModuleId,
  ModuleRecord,
  PreviewNode,
  PreviewPath,
  RuntimeEvent,
  SourceLocation,
  VNodeId,
  VNodeRecord,
} from "@mithril-inspector/protocol"
import { makeVNodeId, PROTOCOL_VERSION } from "@mithril-inspector/protocol"

import { createComponentRegistry } from "./components.js"
import type { ComponentRegistry } from "./components.js"
import { createDomAssociationRegistry } from "./dom-association.js"
import type { DomAssociationRegistry } from "./dom-association.js"
import { createErrorBoundary } from "./errors.js"
import type { ErrorBoundary } from "./errors.js"
import { createSerializer } from "./serializer.js"
import type { ComponentDataSerializer, ExpandOptions, Serializer } from "./serializer.js"
import { createSourceRegistry } from "./source-registry.js"
import type { ModuleRegistrationInput, SourceRegistry } from "./source-registry.js"

export const RUNTIME_VERSION = "0.0.0"

/** Performance/feature modes (§17). Phase 1 ships `"source"`. */
export type InspectorMode = "source" | "components" | "full"

/**
 * Resolved attrs/state redaction policy (§15). Key patterns are plain,
 * JSON-serializable strings (so an adapter can inject them into a runtime
 * bootstrap); matching is a Phase-3 attrs/state concern and is compiled from
 * these when component data views are built.
 */
export interface RedactionConfig {
  readonly keys: readonly string[]
  readonly replacement: string
}

/** The §15 default replacement token used when none is configured. */
export const DEFAULT_REDACTION_REPLACEMENT = "[redacted]"

export interface RuntimeOptions {
  readonly mode?: InspectorMode
  readonly debug?: boolean
  /** Schedule a batched flush (default `queueMicrotask`); overridable in tests. */
  readonly schedule?: (flush: () => void) => void
  readonly now?: () => number
  /**
   * Expose a compact, path-free `data-mi="<qualifiedId>"` attribute on element
   * vnodes (§13). Off by default; the normal association path uses a WeakMap and
   * never touches enumerable attrs (§6.2).
   */
  readonly exposeDomAttributes?: boolean
  /** Attrs/state redaction policy wired from the adapter (§15). */
  readonly redact?: RedactionConfig
}

/**
 * The runtime object installed at `window.__MITHRIL_INSPECTOR__`. It is a
 * superset of the standardized {@link MithrilInspectorHook} (§7.1): the
 * transform calls {@link source}/{@link component}/{@link registerSourceModule},
 * and the overlay reads the hook methods plus the richer resolution API below.
 */
export interface InspectorRuntime extends MithrilInspectorHook {
  // --- Transform-facing (the injected `__miSource`/`__miComponent`/`__miRegisterModule`).
  /** Stamp a vnode with a source id and queue association (`__miSource`). */
  source<T>(qualifiedId: string, vnode: T): T
  /** Instrument a component definition (`__miComponent`). */
  component<T>(qualifiedId: string, def: T): T
  /** Install a module's source table from the transform payload (`__miRegisterModule`). */
  registerSourceModule(moduleId: `m:${string}`, registration: ModuleRegistrationInput): void
  /**
   * Drop a module's source table without a replacement (the pre-HMR step the
   * adapter's `handleHotUpdate` calls before the replacement module re-registers,
   * §11.2, ADR-106). A no-op for an unknown module.
   */
  invalidateModule(moduleId: ModuleId): void

  // --- Resolution API (the overlay/picker).
  /** The nearest source location for a DOM node, or `null` (§16). */
  resolveDomSource(node: Node): SourceLocation | null
  /** The nearest component instance owning a DOM node, or `null`. */
  resolveDomComponent(node: Node): ComponentId | null
  /** The source location stamped on a specific vnode, or `null`. */
  sourceOfVnode(vnode: object): SourceLocation | null
  /** A fresh {@link ComponentRecord} for an instance, or `undefined`. */
  componentRecord(id: ComponentId): ComponentRecord | undefined
  /** Root-first ancestor chain for an instance, including itself (§9.1, §19.2.6); `[]` if unknown. */
  componentAncestry(id: ComponentId): ComponentRecord[]
  /** The component's `component-view` source location (§9.3), or `null`. */
  componentViewSource(id: ComponentId): SourceLocation | null
  /**
   * The lazy, redacted preview tree for an instance's attrs (§7.4, §15): the
   * per-component `setInspectorSerializer` hook (§14) runs first if one is
   * attached, then the result is safely serialized. `null` once unmapped.
   */
  attrsPreview(id: ComponentId): PreviewNode | null
  /** The lazy, redacted preview tree for an instance's state (§7.4, §15); see {@link attrsPreview}. */
  statePreview(id: ComponentId): PreviewNode | null
  /**
   * Evaluate a deferred getter, page a truncated container, or expand past a
   * `max-depth` stub for a path previously returned by {@link attrsPreview} or
   * {@link statePreview} (§7.4).
   */
  expandPreview(id: ComponentId, target: "attrs" | "state", path: PreviewPath, options?: ExpandOptions): PreviewNode | null

  // --- Batching / lifecycle.
  /** Run the batched association + event flush now (also used in tests). */
  flush(): void
  /** Request a batched flush after the current render pass. */
  scheduleFlush(): void
  /**
   * Drop all component/DOM-association tracking and notify subscribers that
   * the tree was fully invalidated (§9.4 `reset`, §16, task 0021). The
   * primitive for HMR full-invalidation and multiple-runtime detection; if no
   * subscriber is currently listening the reset is delivered to the next one
   * that calls {@link subscribe} instead of being silently dropped.
   */
  resetTracking(): void

  // --- Configuration.
  setMode(mode: InspectorMode): void
  getMode(): InspectorMode
  /** The resolved attrs/state redaction policy (§15); Phase-3 consumers read this. */
  getRedactionConfig(): RedactionConfig
  /** Exclude an overlay host element (and its subtree) from tracking (§8.2). */
  excludeHost(host: Node): void
  /** Whether an inspector feature is still enabled (§16). */
  isEnabled(feature: string): boolean

  // --- Public §14 helpers (also re-exported as free functions from the package).
  setInspectorDisplayName(def: object, name: string): void
  markInspectorHidden(def: object): void
  setInspectorSerializer(def: object, serializer: ComponentDataSerializer): void

  // --- Internals exposed for the public-API module.
  readonly components: ComponentRegistry
}

/** Mithril's non-element vnode tags: fragment, text, trusted HTML (§7.6). */
const NON_ELEMENT_TAGS = new Set(["[", "#", "<"])

export function createRuntime(options: RuntimeOptions = {}): InspectorRuntime {
  const schedule = options.schedule ?? ((flush: () => void) => queueMicrotask(flush))
  let mode: InspectorMode = options.mode ?? "source"
  const exposeDomAttributes = options.exposeDomAttributes ?? false
  const redaction: RedactionConfig = options.redact ?? { keys: [], replacement: DEFAULT_REDACTION_REPLACEMENT }

  // §13: stamp a compact, path-free `data-mi` attribute on element vnodes only.
  const exposeDomAttribute = (qualifiedId: string, vnode: unknown): void => {
    if (vnode === null || typeof vnode !== "object") return
    const candidate = vnode as { tag?: unknown; attrs?: Record<string, unknown> | null }
    if (typeof candidate.tag !== "string" || NON_ELEMENT_TAGS.has(candidate.tag)) return
    const attrs = candidate.attrs
    if (attrs === null || attrs === undefined || typeof attrs !== "object") {
      candidate.attrs = { "data-mi": qualifiedId }
    } else {
      attrs["data-mi"] = qualifiedId
    }
  }

  const subscribers = new Set<InspectorListener>()
  const excludedHosts = new Set<Node>()
  // A `reset` fired with no active subscriber (e.g. right after a
  // getRuntime() multiple-runtime-mismatch install, before anyone could
  // possibly have subscribed yet) is not silently lost — it is delivered to
  // whichever subscriber attaches next (§16, task 0021).
  let pendingReset = false

  // Manual protocol registrations (the hook's register* methods). The transform
  // uses the free functions above; these stay empty in normal operation and
  // exist for programmatic/protocol consumers.
  const manualComponents = new Map<ComponentId, ComponentRecord>()
  const manualVnodes = new Map<VNodeId, VNodeRecord>()
  const manualDomAssoc = new Map<Node, DomAssociation[]>()

  const boundary: ErrorBoundary = createErrorBoundary({
    debug: options.debug ?? false,
    onDisable: () => emitReset(),
  })

  const notify = (event: RuntimeEvent): void => {
    for (const listener of subscribers) {
      boundary.guard("subscriber", () => listener(event), undefined)
    }
  }

  // Shared by the error boundary's onDisable and resetTracking(): deliver a
  // reset now if anyone is listening, otherwise remember it for the first
  // future subscriber (see `pendingReset` above).
  const emitReset = (): void => {
    if (subscribers.size > 0) {
      notify({ type: "reset" })
    } else {
      pendingReset = true
    }
  }

  const sources: SourceRegistry = createSourceRegistry()
  const domAssoc: DomAssociationRegistry = createDomAssociationRegistry(sources)
  const components: ComponentRegistry = createComponentRegistry(sources, {
    emit: notify,
    ...(options.now ? { now: options.now } : {}),
    onActivity: () => scheduleFlush(),
    getMode: () => mode,
  })
  const serializer: Serializer = createSerializer({
    redactKeys: redaction.keys,
    replacement: redaction.replacement,
  })

  // §14: run a component's custom attrs()/state() hook before the safe
  // serializer sees the value; a throwing hook falls back to the raw value
  // rather than breaking the preview (§16).
  const applyCustomSerializer = (fn: ((value: unknown) => unknown) | undefined, value: unknown): unknown => {
    if (fn === undefined) return value
    try {
      return fn(value)
    } catch {
      return value
    }
  }

  const rawPreviewInput = (id: ComponentId, target: "attrs" | "state"): { value: unknown } | null => {
    const record = components.recordOf(id)
    if (record === undefined) return null
    const def = components.defOf(id)
    const custom = def === undefined ? undefined : components.serializerOf(def)
    const raw = target === "attrs" ? record.attrs : record.state
    const hook = target === "attrs" ? custom?.attrs : custom?.state
    return { value: applyCustomSerializer(hook, raw) }
  }

  let flushScheduled = false
  const scheduleFlush = (): void => {
    if (flushScheduled) return
    flushScheduled = true
    schedule(() => runtime.flush())
  }

  // Lazy per-node vnode ids, only for the snapshot's DomAssociation shape.
  const vnodeIdByNode = new WeakMap<Node, VNodeId>()
  let nextVnodeId = 0
  const vnodeIdForNode = (node: Node): VNodeId => {
    let id = vnodeIdByNode.get(node)
    if (id === undefined) {
      nextVnodeId += 1
      id = makeVNodeId(nextVnodeId)
      vnodeIdByNode.set(node, id)
    }
    return id
  }

  const isUnderExcludedHost = (node: Node): boolean => {
    if (excludedHosts.size === 0) return false
    for (let current: Node | null = node; current !== null; current = current.parentNode) {
      if (excludedHosts.has(current)) return true
    }
    return false
  }

  const runtime: InspectorRuntime = {
    protocolVersion: PROTOCOL_VERSION,
    runtimeVersion: RUNTIME_VERSION,
    components,

    // --- Transform-facing ---------------------------------------------------
    source(qualifiedId, vnode) {
      return boundary.guard(
        "source",
        () => {
          if (exposeDomAttributes) exposeDomAttribute(qualifiedId, vnode)
          const tagged = domAssoc.tag(qualifiedId, vnode)
          scheduleFlush()
          return tagged
        },
        vnode,
      )
    },
    component(qualifiedId, def) {
      return boundary.guard("component", () => components.instrument(qualifiedId, def), def)
    },
    registerSourceModule(moduleId, registration) {
      boundary.guard(
        "registry",
        () => {
          sources.registerModule(moduleId, registration)
        },
        undefined,
      )
    },
    invalidateModule(moduleId) {
      boundary.guard(
        "registry",
        () => {
          sources.invalidateModule(moduleId)
        },
        undefined,
      )
    },

    // --- Resolution ---------------------------------------------------------
    resolveDomSource(node) {
      return boundary.guard("source", () => domAssoc.resolveDomSource(node), null)
    },
    resolveDomComponent(node) {
      return boundary.guard(
        "component",
        () => (isUnderExcludedHost(node) ? null : components.resolveDomComponent(node)),
        null,
      )
    },
    sourceOfVnode(vnode) {
      return boundary.guard("source", () => domAssoc.sourceOfVnode(vnode), null)
    },
    componentRecord(id) {
      return boundary.guard("component", () => components.recordOf(id), undefined)
    },
    componentAncestry(id) {
      return boundary.guard("component", () => components.ancestryOf(id), [])
    },
    componentViewSource(id) {
      return boundary.guard("component", () => components.viewSourceOf(id), null)
    },
    attrsPreview(id) {
      return boundary.guard(
        "serializer",
        () => {
          const input = rawPreviewInput(id, "attrs")
          return input === null ? null : serializer.serialize(input.value)
        },
        null,
      )
    },
    statePreview(id) {
      return boundary.guard(
        "serializer",
        () => {
          const input = rawPreviewInput(id, "state")
          return input === null ? null : serializer.serialize(input.value)
        },
        null,
      )
    },
    expandPreview(id, target, path, expandOptions) {
      return boundary.guard(
        "serializer",
        () => {
          const input = rawPreviewInput(id, target)
          return input === null ? null : serializer.expand(input.value, path, expandOptions)
        },
        null,
      )
    },

    // --- Batching -----------------------------------------------------------
    flush() {
      flushScheduled = false
      boundary.guard(
        "association",
        () => {
          domAssoc.flush()
          components.flush()
          // §9.4: one batched dom-associated event per flush, covering every
          // node (re)tagged this render pass — not one notification per node.
          // Building the per-node records is real, measured cost (each entry
          // walks up the DOM for its nearest component/source); skip it
          // entirely when nobody is subscribed, since `notify` would discard
          // the result anyway (perf spot-check, task 0021).
          if (subscribers.size > 0) {
            const nodes = domAssoc.associatedNodes()
            if (nodes.length > 0) {
              const records: DomAssociation[] = nodes.map((node) => ({
                vnodeId: vnodeIdForNode(node),
                domRange: { first: node, last: node },
                componentId: components.resolveDomComponent(node),
                source: domAssoc.resolveDomSource(node),
              }))
              notify({ type: "dom-associated", records })
            }
          }
          return undefined
        },
        undefined,
      )
    },
    scheduleFlush,
    resetTracking() {
      boundary.guard(
        "association",
        () => {
          domAssoc.reset()
          components.reset()
          emitReset()
          return undefined
        },
        undefined,
      )
    },

    // --- Configuration ------------------------------------------------------
    setMode(next) {
      mode = next
    },
    getMode() {
      return mode
    },
    getRedactionConfig() {
      return redaction
    },
    excludeHost(host) {
      excludedHosts.add(host)
      domAssoc.excludeHost(host)
    },
    isEnabled(feature) {
      return boundary.isEnabled(feature)
    },

    // --- Public §14 helpers -------------------------------------------------
    setInspectorDisplayName(def, name) {
      boundary.guard(
        "component",
        () => {
          components.setDisplayName(def, name)
          return undefined
        },
        undefined,
      )
    },
    markInspectorHidden(def) {
      boundary.guard(
        "component",
        () => {
          components.markHidden(def)
          return undefined
        },
        undefined,
      )
    },
    setInspectorSerializer(def, serializer) {
      boundary.guard(
        "component",
        () => {
          components.setSerializer(def, serializer)
          return undefined
        },
        undefined,
      )
    },

    // --- Protocol hook methods (§7.1) --------------------------------------
    registerModule(record: ModuleRecord) {
      boundary.guard(
        "registry",
        () => {
          sources.setModule(record)
          return undefined
        },
        undefined,
      )
    },
    registerComponent(record: ComponentRecord) {
      manualComponents.set(record.id, record)
      notify({ type: "components-added", records: [record] })
      return record.id
    },
    registerVNode(record: VNodeRecord) {
      manualVnodes.set(record.id, record)
      return record.id
    },
    associateDom(record: DomAssociation) {
      const node = record.domRange.first
      if (node !== null) {
        const existing = manualDomAssoc.get(node)
        if (existing === undefined) manualDomAssoc.set(node, [record])
        else existing.push(record)
      }
      notify({ type: "dom-associated", records: [record] })
    },
    disposeVNode(vnodeId: VNodeId) {
      manualVnodes.delete(vnodeId)
    },
    subscribe(listener: InspectorListener) {
      subscribers.add(listener)
      if (pendingReset) {
        pendingReset = false
        boundary.guard("subscriber", () => listener({ type: "reset" }), undefined)
      }
      return () => {
        subscribers.delete(listener)
      }
    },
    getSnapshot(): InspectorSnapshot {
      const componentsMap = components.componentsSnapshot()
      for (const [id, record] of manualComponents) if (!componentsMap.has(id)) componentsMap.set(id, record)

      const domAssociations = new Map<Node, DomAssociation[]>()
      for (const node of domAssoc.associatedNodes()) {
        const source = domAssoc.resolveDomSource(node)
        domAssociations.set(node, [
          {
            vnodeId: vnodeIdForNode(node),
            domRange: { first: node, last: node },
            componentId: components.resolveDomComponent(node),
            source,
          },
        ])
      }
      for (const [node, records] of manualDomAssoc) domAssociations.set(node, records)

      return {
        components: componentsMap,
        vnodes: new Map(manualVnodes),
        modules: sources.modulesSnapshot(),
        domAssociations,
      }
    },
  }

  return runtime
}

const GLOBAL_KEY = "__MITHRIL_INSPECTOR__"

/**
 * The lazily-created runtime singleton, installed at
 * `window.__MITHRIL_INSPECTOR__`. If a hook of the same protocol version is
 * already present (e.g. a duplicate runtime copy), it is reused so multiple
 * bundled copies do not corrupt each other (§16).
 */
let singleton: InspectorRuntime | undefined

export function getRuntime(): InspectorRuntime {
  if (singleton !== undefined) return singleton
  const globalObject = globalThis as { [GLOBAL_KEY]?: InspectorRuntime }
  const existing = globalObject[GLOBAL_KEY]
  if (existing !== undefined && existing.protocolVersion === PROTOCOL_VERSION) {
    singleton = existing
    return existing
  }
  if (existing !== undefined) {
    // §16: an incompatible runtime is already installed at the global hook —
    // two different protocol-version copies of the inspector ended up
    // bundled into the same page. Never touch `existing` beyond reading its
    // protocol version (its shape is untrusted); install a fresh runtime
    // instead of silently overwriting, and log a diagnostic.
    // eslint-disable-next-line no-console
    console.warn(
      `[mithril-inspector] Multiple Mithril runtimes were detected: an incompatible runtime ` +
        `(protocol v${String(existing.protocolVersion)}) is already installed at window.__MITHRIL_INSPECTOR__. ` +
        `Installing a fresh runtime (protocol v${PROTOCOL_VERSION}); the previous instance's subscribers are orphaned.`,
    )
  }
  singleton = createRuntime()
  // The new singleton starts with zero subscribers, so this reset is
  // delivered to whichever consumer subscribes to it first (task 0021).
  if (existing !== undefined) singleton.resetTracking()
  globalObject[GLOBAL_KEY] = singleton
  return singleton
}

/** Test-only: drop the installed singleton so a fresh runtime can be created. */
export function __resetRuntimeForTests(): void {
  singleton = undefined
  const globalObject = globalThis as { [GLOBAL_KEY]?: InspectorRuntime }
  delete globalObject[GLOBAL_KEY]
}
