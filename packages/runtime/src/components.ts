import type {
  ComponentId,
  ComponentRecord,
  DomRange,
  RuntimeEvent,
  SourceLocation,
} from "@mithril-inspector/protocol"
import { makeComponentId } from "@mithril-inspector/protocol"

import { domRangeOf, eachRangeNode } from "./dom-range.js"
import type { RenderedVnode } from "./dom-range.js"
import type { SourceRegistry } from "./source-registry.js"

/** The narrow view of a Mithril POJO/closure component the runtime instruments. */
interface AppComponent {
  view: (this: unknown, vnode: unknown) => unknown
  oninit?: (this: unknown, vnode: unknown) => unknown
  oncreate?: (this: unknown, vnode: unknown) => unknown
  onbeforeupdate?: (this: unknown, vnode: unknown, old: unknown) => unknown
  onupdate?: (this: unknown, vnode: unknown) => unknown
  onbeforeremove?: (this: unknown, vnode: unknown) => unknown
  onremove?: (this: unknown, vnode: unknown) => unknown
}

type ComponentKind = ComponentRecord["kind"]

/**
 * Local mirror of `runtime.ts`'s `InspectorMode` (not imported, to avoid a
 * circular dependency — `runtime.ts` imports `createComponentRegistry` from
 * here). §17: `source` ships element/source mapping only; `components`/`full`
 * activate the heavier instance-tracking kinds this task adds (class,
 * route-resolver). Object/closure tracking predates the mode gate (task 0016
 * pulled it forward for the shipped alpha) and stays active in every mode.
 */
type RegistryMode = "source" | "components" | "full"

/** Per-definition metadata captured once at instrument time. */
interface DefMeta {
  readonly qualifiedId: string
  readonly def: object
  readonly kind: ComponentKind
}

interface Rendered extends RenderedVnode {
  tag?: unknown
  children?: unknown
  instance?: unknown
  state?: unknown
  attrs?: unknown
}

interface InstanceRecord {
  readonly id: ComponentId
  readonly meta: DefMeta
  parentId: ComponentId | null
  readonly childIds: ComponentId[]
  latestVnode: Rendered | null
  mounted: boolean
  readonly createdAt: number
  updatedAt: number
  updateCount: number
}

export interface ComponentRegistry {
  /**
   * Instrument a component definition at its definition site (the transform's
   * `__miComponent`). Object and closure forms are wrapped with composed
   * lifecycle hooks (ADR-105) and a view boundary that tracks instance identity
   * and parent/child ownership (ADR-103); the returned value replaces the
   * original expression. Class/function declarations are registered for
   * display-name resolution only in Phase 1 (returned unchanged).
   */
  instrument<T>(qualifiedId: string, def: T): T
  /** The stable id carried by a component's state object, if tracked. */
  idOf(state: object): ComponentId | undefined
  /** A fresh {@link ComponentRecord} snapshot for `id`, or `undefined` once cleaned. */
  recordOf(id: ComponentId): ComponentRecord | undefined
  /** Whether `id` still holds a live (strong) mapping — false once removed. */
  isMapped(id: ComponentId): boolean
  /** Count of currently-mounted instances. */
  liveCount(): number
  /** The DOM range the instance currently spans (§7.6). */
  rangeOf(id: ComponentId): DomRange
  /** The resolved display name for an instance (§9.2 order). */
  displayNameOf(id: ComponentId): string
  /** Re-walk mounted roots and rebuild the node → component map; emit batched events. */
  flush(): void
  /** The nearest (innermost) component instance owning `node`, or `null`. */
  resolveDomComponent(node: Node): ComponentId | null
  /**
   * The root-first ancestor chain for `id`, including the instance itself as
   * the last entry (§9.1 example shape, §19.2.6). Consistent with
   * `recordOf`'s hidden-subtree exclusion (§14): a component inside a hidden
   * ancestor's subtree is itself not visible, so its chain is `[]` rather
   * than a chain with a gap where the hidden ancestor would have been.
   * Returns `[]` for an unknown id.
   */
  ancestryOf(id: ComponentId): ComponentRecord[]
  /**
   * The component's `component-view` source location (§9.3's "component
   * view" open target), or `null` when none exists (inline component with no
   * qualifiedId, no view marker registered, or the instance is hidden).
   */
  viewSourceOf(id: ComponentId): SourceLocation | null
  /** Override an instance's display name for a definition (§14). */
  setDisplayName(def: object, name: string): void
  /** Mark a definition hidden from the component tree (§14). */
  markHidden(def: object): void
  /** Whether a definition is hidden (§14). */
  isHidden(def: object): boolean
  /** Attach a redaction serializer to a definition (§14; stored for Phase 3). */
  setSerializer(def: object, serializer: unknown): void
  /** The serializer attached to a definition, if any. */
  serializerOf(def: object): unknown
  /** A fresh strong snapshot of every live component record (for `getSnapshot`). */
  componentsSnapshot(): Map<ComponentId, ComponentRecord>
}

export interface ComponentRegistryOptions {
  /** Batched runtime-event sink (default no-op). */
  readonly emit?: (event: RuntimeEvent) => void
  /** Clock injection for tests (default `Date.now`). */
  readonly now?: () => number
  /** Called when a component renders, so the runtime can schedule a flush. */
  readonly onActivity?: () => void
  /** Live mode accessor (§17); default always reports `"source"`. */
  readonly getMode?: () => RegistryMode
}

/** Basename without its extension, e.g. `"src/UserCard.tsx"` → `"UserCard"` (§9.2 tier 6). */
function filenameDerivedName(file: string): string | null {
  const base = file.split(/[\\/]/).pop()
  if (base === undefined || base.length === 0) return null
  const stem = base.replace(/\.[^./]+$/, "")
  return stem.length > 0 ? stem : null
}

function isComponentTag(tag: unknown): boolean {
  if (typeof tag === "function") return true
  return tag !== null && typeof tag === "object" && typeof (tag as { view?: unknown }).view === "function"
}

function isObjectComponent(def: unknown): def is AppComponent {
  return def !== null && typeof def === "object" && typeof (def as { view?: unknown }).view === "function"
}

/** A class whose prototype carries `view` (§6.5 class form). */
interface ComponentClass {
  prototype: AppComponent
}

/**
 * A Mithril `RouteResolver` (`m.route()` table entry shaped like
 * `{ render, onmatch? }` instead of `{ view }`). Confirmed against
 * `mithril/api/router.js`: `RouterRoot.view()` calls `currentResolver.render(vnode)`
 * directly — no other lifecycle hooks apply to the resolver itself.
 */
interface RouteResolver {
  render: (this: unknown, vnode: unknown) => unknown
}

function isRouteResolver(def: unknown): def is RouteResolver {
  if (def === null || typeof def !== "object") return false
  const candidate = def as { render?: unknown; view?: unknown }
  return typeof candidate.render === "function" && typeof candidate.view !== "function"
}

function isClassComponent(def: unknown): def is ComponentClass {
  if (typeof def !== "function") return false
  const proto = (def as { prototype?: { view?: unknown } }).prototype
  return proto != null && typeof proto.view === "function"
}

export function createComponentRegistry(
  sources: SourceRegistry,
  options: ComponentRegistryOptions = {},
): ComponentRegistry {
  const emit = options.emit ?? (() => {})
  const now = options.now ?? Date.now
  const onActivity = options.onActivity ?? (() => {})
  const getMode = options.getMode ?? (() => "source")
  let nextInstance = 0

  // vnode.state is the one object Mithril carries across redraws, so it is the
  // stable per-instance identity (ADR-103). The WeakMap keeps records for
  // stale-selection after unmount until GC; byId holds them strongly and is
  // emptied on removal so live DOM nodes cannot leak (§8.8, §17).
  const byState = new WeakMap<object, InstanceRecord>()
  const byId = new Map<ComponentId, InstanceRecord>()
  // Root instances (parentId === null) whose subtree the flush walk associates.
  const roots = new Set<InstanceRecord>()

  // Parent-scope ownership: a component vnode is tagged with the instance whose
  // view created it, read back when that child instance first renders (ADR-103).
  const ownerByVnode = new WeakMap<object, InstanceRecord>()

  // Per-definition overrides (§14), keyed on the application definition object.
  const displayNameOverrides = new WeakMap<object, string>()
  const hidden = new WeakSet<object>()
  const serializers = new WeakMap<object, unknown>()

  // node → component ownership, rebuilt each flush; innermost owner wins.
  interface NodeEntry {
    generation: number
    owners: ComponentId[]
  }
  const byNode = new WeakMap<Node, NodeEntry>()
  let generation = 0

  const addedThisBatch: InstanceRecord[] = []
  const removedThisBatch: ComponentId[] = []

  const allocate = (state: object, vnode: object, meta: DefMeta): InstanceRecord => {
    const owner = ownerByVnode.get(vnode)
    nextInstance += 1
    const timestamp = now()
    const record: InstanceRecord = {
      id: makeComponentId(nextInstance),
      meta,
      parentId: owner === undefined ? null : owner.id,
      childIds: [],
      latestVnode: null,
      mounted: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      updateCount: 0,
    }
    byState.set(state, record)
    byId.set(record.id, record)
    if (owner === undefined) roots.add(record)
    addedThisBatch.push(record)
    return record
  }

  const recordOwnedVnodes = (owner: InstanceRecord, value: unknown): void => {
    if (value === null || typeof value !== "object") return
    if (Array.isArray(value)) {
      for (const child of value) recordOwnedVnodes(owner, child)
      return
    }
    const vnode = value as Rendered
    if (isComponentTag(vnode.tag)) {
      // First tagger wins: re-emitting `vnode.children` never steals ownership
      // from the lexical creator (§7.5).
      if (!ownerByVnode.has(vnode)) ownerByVnode.set(vnode, owner)
      recordOwnedVnodes(owner, vnode.children)
      return
    }
    if (typeof vnode.tag === "string" && vnode.tag !== "#" && vnode.tag !== "<") {
      recordOwnedVnodes(owner, vnode.children)
    }
  }

  const cleanup = (state: unknown): void => {
    if (typeof state !== "object" || state === null) return
    const record = byState.get(state)
    if (record === undefined) return
    record.mounted = false
    byId.delete(record.id)
    roots.delete(record)
    record.latestVnode = null
    removedThisBatch.push(record.id)
  }

  // Update an existing instance's latest vnode (view runs before create/update,
  // so the record always exists here); never allocates.
  const touch = (state: unknown, vnode: Rendered): InstanceRecord | undefined => {
    if (typeof state !== "object" || state === null) return undefined
    const record = byState.get(state)
    if (record === undefined) return undefined
    record.latestVnode = vnode
    return record
  }

  /**
   * Build the composed component. The wrapper inherits from the original
   * definition (via `Object.create`) so any helper methods or state fields the
   * application reads through `this` are preserved (§2.3); only `view` and the
   * six hooks are overridden as own properties.
   */
  const composeHooks = (app: AppComponent, meta: DefMeta): AppComponent => {
    const wrapped = Object.create(app as object) as AppComponent
    wrapped.view = function (this: unknown, vnode: unknown) {
      onActivity()
      const state = (vnode as Rendered).state
      const record = typeof state === "object" && state !== null ? byState.get(state) ?? allocate(state, vnode as object, meta) : undefined
      if (record === undefined) return app.view.call(this, vnode)
      record.latestVnode = vnode as Rendered
      scopeStack.push(record)
      try {
        const result = app.view.call(this, vnode)
        recordOwnedVnodes(record, result)
        return result
      } finally {
        scopeStack.pop()
      }
    }
    wrapped.oninit = function (this: unknown, vnode: unknown) {
      const state = (vnode as Rendered).state
      if (typeof state === "object" && state !== null && !byState.has(state)) {
        allocate(state, vnode as object, meta)
      }
      if (app.oninit !== undefined) return app.oninit.call(this, vnode)
      return undefined
    }
    wrapped.oncreate = function (this: unknown, vnode: unknown) {
      touch((vnode as Rendered).state, vnode as Rendered)
      if (app.oncreate !== undefined) return app.oncreate.call(this, vnode)
      return undefined
    }
    wrapped.onbeforeupdate = function (this: unknown, vnode: unknown, old: unknown) {
      // Pure pass-through: the inspector must never veto an update (§2.3).
      if (app.onbeforeupdate !== undefined) return app.onbeforeupdate.call(this, vnode, old)
      return undefined
    }
    wrapped.onupdate = function (this: unknown, vnode: unknown) {
      const record = touch((vnode as Rendered).state, vnode as Rendered)
      if (record !== undefined) {
        record.updateCount += 1
        record.updatedAt = now()
      }
      if (app.onupdate !== undefined) return app.onupdate.call(this, vnode)
      return undefined
    }
    wrapped.onbeforeremove = function (this: unknown, vnode: unknown) {
      // Pure pass-through so an async removal delay stays intact (§7.7).
      if (app.onbeforeremove !== undefined) return app.onbeforeremove.call(this, vnode)
      return undefined
    }
    wrapped.onremove = function (this: unknown, vnode: unknown) {
      try {
        if (app.onremove !== undefined) return app.onremove.call(this, vnode)
        return undefined
      } finally {
        // Always clean, even if the application hook threw — the mapping must
        // not leak and the original exception still propagates (§7.7).
        cleanup((vnode as Rendered).state)
      }
    }
    return wrapped
  }

  /**
   * Class components (ADR-103 "prototype facade"): a class constructor's own
   * `.prototype` property is non-writable (verified: `class Klass {}` throws
   * on `Klass.prototype = x` in strict mode, unlike a plain `function`), so
   * — unlike the object/closure path — the wrap can't be a fresh
   * `Object.create` reference swapped in. Instead, snapshot the original
   * `view`/hooks into a plain object first (so the wrapped functions close
   * over the *originals*, not the live prototype), build the same composed
   * wrapper `composeHooks` uses for object/closure, and copy its own
   * properties directly onto the existing prototype object. Mutating the one
   * prototype object every instance already shares is the only mechanism
   * available for a declaration-form binding that can't be rebound.
   */
  const instrumentClassPrototype = (proto: AppComponent, meta: DefMeta): void => {
    const original: AppComponent = {
      view: proto.view,
      ...(proto.oninit ? { oninit: proto.oninit } : {}),
      ...(proto.oncreate ? { oncreate: proto.oncreate } : {}),
      ...(proto.onbeforeupdate ? { onbeforeupdate: proto.onbeforeupdate } : {}),
      ...(proto.onupdate ? { onupdate: proto.onupdate } : {}),
      ...(proto.onbeforeremove ? { onbeforeremove: proto.onbeforeremove } : {}),
      ...(proto.onremove ? { onremove: proto.onremove } : {}),
    }
    // `composeHooks` always defines all six wrapped hooks as own properties
    // (never `undefined`) — see its body — so the non-null assertions below
    // just recover that guarantee past `AppComponent`'s optional typing.
    const wrapped = composeHooks(original, meta)
    proto.view = wrapped.view
    proto.oninit = wrapped.oninit!
    proto.oncreate = wrapped.oncreate!
    proto.onbeforeupdate = wrapped.onbeforeupdate!
    proto.onupdate = wrapped.onupdate!
    proto.onbeforeremove = wrapped.onbeforeremove!
    proto.onremove = wrapped.onremove!
  }

  /**
   * Route-resolvers (`m.route()` table entries shaped `{ render }`): a
   * resolver is an inline object expression, always rebindable at its
   * definition site (unlike a class/function *declaration*), so — like
   * object components — the wrap can be a fresh `Object.create` facade
   * returned as a new reference. It differs from a component's `view` in two
   * ways: Mithril calls `resolver.render(vnode)` as a plain method (no
   * `oninit`/`oncreate`/etc. — confirmed against `mithril/api/router.js`),
   * and there is no `vnode.state` of its own to key identity on, since
   * Mithril never constructs or factory-calls the resolver — `this` at call
   * time (the resolver object) is the only stable per-instance carrier.
   * Allocated lazily as a *root* (no lexical owner ever tags it) so it plugs
   * into the existing root flush-walk with no other changes. A resolver also
   * has no unmount signal (it simply stops being called when the route
   * changes) — once allocated it stays `mounted: true` for the app's
   * lifetime.
   */
  const composeRouteResolver = (def: RouteResolver, meta: DefMeta): RouteResolver => {
    const wrapped: RouteResolver = Object.create(def)
    wrapped.render = function (this: unknown, vnode: unknown) {
      onActivity()
      const state = this as object
      const record = byState.get(state) ?? allocate(state, vnode as object, meta)
      scopeStack.push(record)
      try {
        const result = def.render.call(this, vnode)
        record.latestVnode = result as Rendered
        recordOwnedVnodes(record, result)
        return result
      } finally {
        scopeStack.pop()
      }
    }
    return wrapped
  }

  // A component's view creates child component vnodes within its own scope; the
  // stack lets `recordOwnedVnodes` attribute them to the right lexical parent.
  const scopeStack: InstanceRecord[] = []

  const registerRange = (node: Node, id: ComponentId): void => {
    const entry = byNode.get(node)
    if (entry === undefined || entry.generation !== generation) {
      byNode.set(node, { generation, owners: [id] })
    } else {
      entry.owners.push(id)
    }
  }

  // Walk a mounted root's rendered tree once, registering every top-level node of
  // each component's range outermost → innermost so the innermost owner wins.
  // Also rebuilds `childIds` in current render order (ADR-103 follow-up, task
  // 0017) — cleared and repopulated fresh at each visited parent every flush,
  // rather than accumulated once at allocation time.
  const visitForOwnership = (root: InstanceRecord): void => {
    const visit = (value: unknown, parent: InstanceRecord): void => {
      if (value === null || typeof value !== "object") return
      if (Array.isArray(value)) {
        for (const child of value) visit(child, parent)
        return
      }
      const vnode = value as Rendered
      if (isComponentTag(vnode.tag)) {
        const state = vnode.state
        const record = typeof state === "object" && state !== null ? byState.get(state) : undefined
        if (record !== undefined) {
          record.latestVnode = vnode
          eachRangeNode(domRangeOf(vnode), (node) => registerRange(node, record.id))
          // The walk's own root vnode self-matches here (it is a component,
          // and `parent` starts out as `root` itself) — only record a
          // parent/child link for an actual descendant, not the root's own
          // (already-cleared) `childIds`.
          if (record !== parent) parent.childIds.push(record.id)
          record.childIds.length = 0
          visit(vnode.instance, record)
        } else {
          visit(vnode.instance, parent)
        }
        return
      }
      if (typeof vnode.tag === "string" && vnode.tag !== "#" && vnode.tag !== "<") {
        visit(vnode.children, parent)
      }
    }
    root.childIds.length = 0
    visit(root.latestVnode, root)
  }

  interface DisplayNameResult {
    readonly name: string
    /** True for the §9.2 fallback tiers (filename-derived, `"Anonymous"`) rather than an explicit or declared name. */
    readonly inferred: boolean
  }

  const resolveDisplayName = (record: InstanceRecord): DisplayNameResult => {
    const override = displayNameOverrides.get(record.meta.def)
    if (override !== undefined && override.length > 0) return { name: override, inferred: false }
    const declared = (record.meta.def as { displayName?: unknown }).displayName
    if (typeof declared === "string" && declared.length > 0) return { name: declared, inferred: false }
    const source = record.meta.qualifiedId === "" ? null : sources.resolveSource(record.meta.qualifiedId)
    if (source?.displayName !== undefined && source.displayName.length > 0) {
      return { name: source.displayName, inferred: false }
    }
    const named = (record.meta.def as { name?: unknown }).name
    if (typeof named === "string" && named.length > 0) return { name: named, inferred: false }
    const file = source?.relativeFile || source?.absoluteFile
    const filename = file === undefined || file === "" ? null : filenameDerivedName(file)
    if (filename !== null) return { name: filename, inferred: true }
    return { name: "Anonymous", inferred: true }
  }

  // §14: a hidden definition excludes its instance *and* subtree from
  // records. Filtered at the read boundary (not at instrument/allocate time)
  // since `markInspectorHidden` can be called before or after `instrument()`
  // ran for the same def — tracking itself stays uniform for every instance.
  const isVisible = (record: InstanceRecord): boolean => {
    let current: InstanceRecord | undefined = record
    while (current !== undefined) {
      if (hidden.has(current.meta.def)) return false
      current = current.parentId === null ? undefined : byId.get(current.parentId)
    }
    return true
  }

  const toRecord = (record: InstanceRecord): ComponentRecord => {
    const source = record.meta.qualifiedId === "" ? null : sources.resolveSource(record.meta.qualifiedId)
    const range = record.latestVnode === null ? null : domRangeOf(record.latestVnode)
    const { name: displayName, inferred: displayNameInferred } = resolveDisplayName(record)
    // "anonymous" is a read-time refinement of the structural "object" kind
    // (§2.4 "anonymous or unknown component"): an inline literal with no
    // discoverable name at all — a filename-derived fallback no longer
    // counts (§9.2 tier 6 is still *some* resolved name). Kind stays
    // structural at allocate time since display-name resolution depends on
    // source-registry state that may not be populated yet when
    // `instrument()` runs.
    const kind = record.meta.kind === "object" && displayName === "Anonymous" ? "anonymous" : record.meta.kind
    return {
      id: record.id,
      parentId: record.parentId,
      displayName,
      displayNameInferred,
      source,
      kind,
      attrs: record.latestVnode?.attrs ?? null,
      state: record.latestVnode?.state ?? null,
      mounted: record.mounted,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      updateCount: record.updateCount,
      domRange: range,
      childIds: [...record.childIds],
    }
  }

  const registry: ComponentRegistry = {
    instrument<T>(qualifiedId: string, def: T): T {
      if (isObjectComponent(def)) {
        return composeHooks(def, { qualifiedId, def: def as object, kind: "object" }) as T
      }
      if (typeof def === "function" && !isClassComponent(def)) {
        // Closure/function component: wrap the factory so the state object it
        // returns is instrumented per instance (ADR-105 limitation notes).
        const factory = def as unknown as (vnode: unknown) => unknown
        const meta: DefMeta = { qualifiedId, def: def as object, kind: "closure" }
        const wrapped = (vnode: unknown): unknown => {
          const state = factory(vnode)
          return isObjectComponent(state) ? composeHooks(state, meta) : state
        }
        return wrapped as T
      }
      // Class components (task 0017, ADR-103 "prototype facade"): a class
      // *declaration*'s binding can't be rebound by the transform (unlike
      // `const X = <expr>`), so interception has to mutate the prototype the
      // class already has, not return a different reference — this works
      // identically whether `def` came from a declaration or a
      // `const X = class {}` expression. Only active outside `mode: "source"`
      // (§17; object/closure tracking predates the mode gate and stays
      // unconditional — see the runtime README's mode table).
      if (isClassComponent(def) && getMode() !== "source") {
        instrumentClassPrototype(def.prototype, { qualifiedId, def: def as object, kind: "class" })
        return def as T
      }
      // Route-resolvers (task 0017): runtime-only detection reachable via
      // this method / the public `inspectComponent()` API — the transform
      // doesn't yet find `{render, onmatch}` table entries in real
      // `m.route()` config (§6.5 only detects `view`-shaped components), so
      // real end-to-end tracking needs a follow-up transform change.
      if (isRouteResolver(def) && getMode() !== "source") {
        return composeRouteResolver(def, { qualifiedId, def: def as object, kind: "route-resolver" }) as T
      }
      return def
    },
    idOf(state) {
      return byState.get(state)?.id
    },
    recordOf(id) {
      const record = byId.get(id)
      return record === undefined || !isVisible(record) ? undefined : toRecord(record)
    },
    isMapped(id) {
      return byId.has(id)
    },
    liveCount() {
      return byId.size
    },
    rangeOf(id) {
      const record = byId.get(id)
      if (record === undefined || record.latestVnode === null) return { first: null, last: null }
      return domRangeOf(record.latestVnode)
    },
    displayNameOf(id) {
      const record = byId.get(id)
      return record === undefined ? "Anonymous" : resolveDisplayName(record).name
    },
    flush() {
      generation += 1
      for (const root of roots) {
        if (root.latestVnode !== null) visitForOwnership(root)
      }
      if (addedThisBatch.length > 0) {
        emit({ type: "components-added", records: addedThisBatch.map(toRecord) })
        addedThisBatch.length = 0
      }
      if (removedThisBatch.length > 0) {
        emit({ type: "components-removed", ids: [...removedThisBatch] })
        removedThisBatch.length = 0
      }
    },
    resolveDomComponent(node) {
      for (let current: Node | null = node; current !== null; current = current.parentNode) {
        const owners = byNode.get(current)?.owners
        if (owners === undefined) continue
        for (let i = owners.length - 1; i >= 0; i--) {
          const id = owners[i]
          if (id === undefined) continue
          const record = byId.get(id)
          if (record !== undefined && isVisible(record)) return id
        }
      }
      return null
    },
    ancestryOf(id) {
      const self = byId.get(id)
      // `isVisible` already walks the full ancestor chain checking every
      // hidden flag (§14 subtree exclusion), so once `self` passes it, no
      // ancestor found while walking `parentId` below can be hidden either.
      if (self === undefined || !isVisible(self)) return []
      const chain: ComponentRecord[] = [toRecord(self)]
      let parentId = self.parentId
      while (parentId !== null) {
        const candidate = byId.get(parentId)
        if (candidate === undefined) break
        chain.push(toRecord(candidate))
        parentId = candidate.parentId
      }
      return chain.reverse()
    },
    viewSourceOf(id) {
      const record = byId.get(id)
      if (record === undefined || !isVisible(record) || record.meta.qualifiedId === "") return null
      const parsed = sources.parseQualified(record.meta.qualifiedId)
      if (parsed === null) return null
      const match = /^s(\d+)$/.exec(parsed.sourceId)
      if (match === null) return null
      const nextSourceId = `s${Number(match[1]) + 1}`
      const location = sources.resolveSource(`${parsed.moduleId}:${nextSourceId}`)
      return location !== null && location.kind === "component-view" ? location : null
    },
    setDisplayName(def, name) {
      displayNameOverrides.set(def, name)
    },
    markHidden(def) {
      hidden.add(def)
    },
    isHidden(def) {
      return hidden.has(def)
    },
    setSerializer(def, serializer) {
      serializers.set(def, serializer)
    },
    serializerOf(def) {
      return serializers.get(def)
    },
    componentsSnapshot() {
      const snapshot = new Map<ComponentId, ComponentRecord>()
      for (const record of byId.values()) {
        if (isVisible(record)) snapshot.set(record.id, toRecord(record))
      }
      return snapshot
    },
  }

  return registry
}
