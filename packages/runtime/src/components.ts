import type { ComponentId, ComponentRecord, DomRange, RuntimeEvent } from "@mithril-inspector/protocol"
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
}

function isComponentTag(tag: unknown): boolean {
  if (typeof tag === "function") return true
  return tag !== null && typeof tag === "object" && typeof (tag as { view?: unknown }).view === "function"
}

function isObjectComponent(def: unknown): def is AppComponent {
  return def !== null && typeof def === "object" && typeof (def as { view?: unknown }).view === "function"
}

function isClassComponent(def: unknown): boolean {
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
    else owner.childIds.push(record.id)
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
  const visitForOwnership = (root: InstanceRecord): void => {
    const visit = (value: unknown): void => {
      if (value === null || typeof value !== "object") return
      if (Array.isArray(value)) {
        for (const child of value) visit(child)
        return
      }
      const vnode = value as Rendered
      if (isComponentTag(vnode.tag)) {
        const state = vnode.state
        const record = typeof state === "object" && state !== null ? byState.get(state) : undefined
        if (record !== undefined) {
          record.latestVnode = vnode
          eachRangeNode(domRangeOf(vnode), (node) => registerRange(node, record.id))
        }
        visit(vnode.instance)
        return
      }
      if (typeof vnode.tag === "string" && vnode.tag !== "#" && vnode.tag !== "<") {
        visit(vnode.children)
      }
    }
    visit(root.latestVnode)
  }

  const resolveDisplayName = (record: InstanceRecord): string => {
    const override = displayNameOverrides.get(record.meta.def)
    if (override !== undefined && override.length > 0) return override
    const declared = (record.meta.def as { displayName?: unknown }).displayName
    if (typeof declared === "string" && declared.length > 0) return declared
    const source = record.meta.qualifiedId === "" ? null : sources.resolveSource(record.meta.qualifiedId)
    if (source?.displayName !== undefined && source.displayName.length > 0) return source.displayName
    const named = (record.meta.def as { name?: unknown }).name
    if (typeof named === "string" && named.length > 0) return named
    return "Anonymous"
  }

  const toRecord = (record: InstanceRecord): ComponentRecord => {
    const source = record.meta.qualifiedId === "" ? null : sources.resolveSource(record.meta.qualifiedId)
    const range = record.latestVnode === null ? null : domRangeOf(record.latestVnode)
    return {
      id: record.id,
      parentId: record.parentId,
      displayName: resolveDisplayName(record),
      source,
      kind: record.meta.kind,
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
      return def
    },
    idOf(state) {
      return byState.get(state)?.id
    },
    recordOf(id) {
      const record = byId.get(id)
      return record === undefined ? undefined : toRecord(record)
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
      return record === undefined ? "Anonymous" : resolveDisplayName(record)
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
        if (owners !== undefined && owners.length > 0) return owners[owners.length - 1] ?? null
      }
      return null
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
      for (const record of byId.values()) snapshot.set(record.id, toRecord(record))
      return snapshot
    },
  }

  return registry
}
