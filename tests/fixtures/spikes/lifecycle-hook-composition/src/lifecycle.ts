import type { Children, Vnode, VnodeDOM } from "mithril"

export type ComponentId = `c:${number}`
export type SourceId = string

export interface DomRange {
  first: Node | null
  last: Node | null
}

/**
 * A Mithril POJO component as the transform sees it at its definition site: a
 * `view` plus any of the six lifecycle hooks. The `this: State` typing mirrors
 * how Mithril actually calls them (via `callHook`, `this === vnode.state`) and
 * matches the clean signatures the sibling spikes use for `instrumentView`,
 * rather than Mithril's public `_NoLifecycle<this & State>` `this`-encoding.
 * It is structurally compatible with `m.Component`, so the wrapped result can be
 * handed straight to `m()`.
 */
export interface InstrumentedComponent<Attrs = Record<string, unknown>, State extends object = object> {
  view(this: State, vnode: Vnode<Attrs, State>): Children | null | void
  oninit?(this: State, vnode: Vnode<Attrs, State>): unknown
  oncreate?(this: State, vnode: VnodeDOM<Attrs, State>): unknown
  onbeforeupdate?(this: State, vnode: Vnode<Attrs, State>, old: VnodeDOM<Attrs, State>): boolean | void
  onupdate?(this: State, vnode: VnodeDOM<Attrs, State>): unknown
  onbeforeremove?(this: State, vnode: VnodeDOM<Attrs, State>): Promise<unknown> | void
  onremove?(this: State, vnode: VnodeDOM<Attrs, State>): unknown
}

/**
 * The inspector-side record for one mounted component instance: its stable id
 * and the source marker the transform stamped at the definition site. The
 * runtime keeps these alive only while the instance is mounted (see cleanup in
 * {@link LifecycleRegistry.instrumentComponent}).
 */
export interface InstanceRecord {
  readonly id: ComponentId
  readonly sourceId: SourceId
}

export interface LifecycleRegistry {
  /**
   * Wraps a component definition, composing the inspector's own logic into all
   * six lifecycle hooks *and* the view, simulating what the build-time transform
   * would emit at the definition site (see ADR-103/104/105). The returned
   * component is a fresh object — the original definition is never mutated — and
   * for every hook the wrapper:
   *
   * - calls the application hook (if any), preserving `this`, its arguments,
   *   its return value and ordering;
   * - never swallows an exception the application hook throws;
   * - never modifies `vnode.state`;
   * - adds no behaviour that could veto an update or delay a removal on its own.
   *
   * The `onremove` wrapper additionally cleans the instance's inspector mapping,
   * and `oncreate`/`onupdate` capture the instance's current DOM range (§7.6).
   */
  instrumentComponent<Attrs, State extends object>(
    sourceId: SourceId,
    component: InstrumentedComponent<Attrs, State>,
  ): InstrumentedComponent<Attrs, State>
  /** The stable id carried by a component's state object, if tracked. */
  idOf(state: object): ComponentId | undefined
  /** The record for `id` while the instance is mounted, else `undefined`. */
  recordOf(id: ComponentId): InstanceRecord | undefined
  /** Whether `id` still holds a live (strong) mapping — false once cleaned. */
  isMapped(id: ComponentId): boolean
  /** Count of currently-mapped (mounted) instances. */
  liveCount(): number
  /** The top-level DOM nodes captured for `id`; empty once cleaned. */
  nodesOf(id: ComponentId): readonly Node[]
  /** The `DomRange { first, last }` the instance currently spans (§7.6). */
  rangeOf(id: ComponentId): DomRange
}

/**
 * Structural view of the Mithril 2.x vnode fields read after a render pass. A
 * fragment-root component copies `dom`/`domSize` from its normalized `"["`
 * instance, so a component vnode reports the full width of its fragment.
 */
interface RenderedVnode {
  dom?: Node | null | undefined
  domSize?: number | undefined
}

interface MutableRecord {
  readonly id: ComponentId
  readonly sourceId: SourceId
  latestVnode: RenderedVnode | null
  readonly nodes: Set<Node>
}

/**
 * Reads the DOM range Mithril recorded on a rendered vnode. An element or text
 * vnode leaves `domSize` undefined (a single node); a fragment root records the
 * first rendered node in `dom` and the count of top-level nodes in `domSize`
 * (`dom = null`, `domSize = 0` when it produced nothing).
 */
export function domRangeOf(vnode: RenderedVnode): DomRange {
  const first = vnode.dom ?? null
  if (first === null || vnode.domSize === 0) return { first: null, last: null }
  const size = vnode.domSize ?? 1
  let last: Node = first
  for (let index = 1; index < size; index += 1) {
    const next: Node | null = last.nextSibling
    if (next === null) break
    last = next
  }
  return { first, last }
}

export function createLifecycleRegistry(): LifecycleRegistry {
  let nextInstance = 0
  // vnode.state is the one object Mithril carries across redraws
  // (`vnode.state = old.state`), so it is the stable per-instance identity. The
  // WeakMap holds the record weakly, so a stale selection can still resolve to
  // the record after unmount until it is garbage-collected (§8.8), while `byId`
  // holds it strongly and is emptied on removal so live DOM nodes cannot leak.
  const byState = new WeakMap<object, MutableRecord>()
  const byId = new Map<ComponentId, MutableRecord>()

  const ensureRecord = (state: object, sourceId: SourceId): MutableRecord => {
    let record = byState.get(state)
    if (record === undefined) {
      nextInstance += 1
      record = { id: `c:${nextInstance}`, sourceId, latestVnode: null, nodes: new Set() }
      byState.set(state, record)
      byId.set(record.id, record)
    }
    return record
  }

  // Snapshot the instance's current top-level DOM nodes so removal can drop the
  // strong references. Reads Mithril's own `dom`/`domSize`, so it stays correct
  // for elements and fragment roots alike without extra bookkeeping.
  const capture = (state: unknown, vnode: RenderedVnode): void => {
    if (typeof state !== "object" || state === null) return
    const record = byState.get(state)
    if (record === undefined) return
    record.latestVnode = vnode
    record.nodes.clear()
    const range = domRangeOf(vnode)
    let node: Node | null = range.first
    while (node !== null) {
      record.nodes.add(node)
      if (node === range.last) break
      node = node.nextSibling
    }
  }

  // Drop the strong mapping for a removed instance: delete the id→record entry
  // and release the captured DOM nodes/vnode. The weak `byState` entry may
  // linger for stale-selection resolution until it is garbage-collected.
  const cleanup = (state: unknown): void => {
    if (typeof state !== "object" || state === null) return
    const record = byState.get(state)
    if (record === undefined) return
    byId.delete(record.id)
    record.nodes.clear()
    record.latestVnode = null
  }

  return {
    instrumentComponent<Attrs, State extends object>(
      sourceId: SourceId,
      component: InstrumentedComponent<Attrs, State>,
    ): InstrumentedComponent<Attrs, State> {
      const app = component
      const wrapped: InstrumentedComponent<Attrs, State> = {
        view(this: State, vnode: Vnode<Attrs, State>) {
          ensureRecord(vnode.state, sourceId)
          return app.view.call(this, vnode)
        },
        oninit(this: State, vnode: Vnode<Attrs, State>) {
          // Allocate identity as early as Mithril touches the instance.
          ensureRecord(vnode.state, sourceId)
          if (app.oninit !== undefined) return app.oninit.call(this, vnode)
          return undefined
        },
        oncreate(this: State, vnode: VnodeDOM<Attrs, State>) {
          capture(vnode.state, vnode)
          if (app.oncreate !== undefined) return app.oncreate.call(this, vnode)
          return undefined
        },
        onbeforeupdate(this: State, vnode: Vnode<Attrs, State>, old: VnodeDOM<Attrs, State>) {
          // Pure pass-through: the inspector must never veto an update on its own
          // (§2.3). `undefined` when the application has no opinion lets Mithril
          // proceed exactly as if no hook existed.
          if (app.onbeforeupdate !== undefined) return app.onbeforeupdate.call(this, vnode, old)
          return undefined
        },
        onupdate(this: State, vnode: VnodeDOM<Attrs, State>) {
          capture(vnode.state, vnode)
          if (app.onupdate !== undefined) return app.onupdate.call(this, vnode)
          return undefined
        },
        onbeforeremove(this: State, vnode: VnodeDOM<Attrs, State>) {
          // Pure pass-through so an async removal delay stays intact; the mapping
          // is retained through the deferred window and cleaned in `onremove`.
          if (app.onbeforeremove !== undefined) return app.onbeforeremove.call(this, vnode)
          return undefined
        },
        onremove(this: State, vnode: VnodeDOM<Attrs, State>) {
          try {
            if (app.onremove !== undefined) return app.onremove.call(this, vnode)
            return undefined
          } finally {
            // Always clean, even if the application hook threw — the mapping must
            // not leak, and the original exception still propagates.
            cleanup(vnode.state)
          }
        },
      }
      return wrapped
    },
    idOf(state) {
      return byState.get(state)?.id
    },
    recordOf(id) {
      const record = byId.get(id)
      if (record === undefined) return undefined
      return { id: record.id, sourceId: record.sourceId }
    },
    isMapped(id) {
      return byId.has(id)
    },
    liveCount() {
      return byId.size
    },
    nodesOf(id) {
      const record = byId.get(id)
      if (record === undefined) return []
      return Array.from(record.nodes)
    },
    rangeOf(id) {
      const record = byId.get(id)
      if (record === undefined || record.latestVnode === null) return { first: null, last: null }
      return domRangeOf(record.latestVnode)
    },
  }
}
