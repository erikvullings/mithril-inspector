import type { Children, Vnode } from "mithril"

export type ComponentId = `c:${number}`
export type SourceId = string

export interface DomRange {
  first: Node | null
  last: Node | null
}

/**
 * What a rendered DOM node resolves to: the nearest owning component instance
 * and that component's source marker. A fragment-root component produces many
 * top-level nodes, and every one of them carries this same ownership so the
 * picker can select the component through any of its nodes (§20.1.9).
 */
export interface ComponentOwnership {
  readonly componentId: ComponentId
  readonly sourceId: SourceId | null
}

export interface FragmentRegistry {
  /**
   * Wraps a component view at its definition site, simulating the transform's
   * injected `__miView(sourceId, view)` (see ADR-103). The wrapper assigns the
   * instance a stable id keyed on `vnode.state`, records the component's source
   * marker and captures the current component vnode so its DomRange can be read
   * after the render pass — without mutating state, attrs or the return value.
   */
  instrumentView<Attrs, State, Result extends Children | null | void>(
    sourceId: SourceId,
    view: (this: State, vnode: Vnode<Attrs, State>) => Result,
  ): (this: State, vnode: Vnode<Attrs, State>) => Result
  /**
   * Re-walks the rendered vnode tree after a render pass and rebuilds the
   * node → component ownership map. Safe to call after every redraw.
   */
  associateTree(rendered: Children): void
  /** The nearest component instance owning `node` (walks ancestors). */
  componentOf(node: Node): ComponentOwnership | undefined
  /** All component ownerships registered for `node`, outermost → innermost. */
  ownersOf(node: Node): readonly ComponentOwnership[]
  /** The `DomRange { first, last }` a component instance currently spans (§7.6). */
  rangeOf(id: ComponentId): DomRange
  /** The stable id carried by a component's state object, if tracked. */
  idOf(state: object): ComponentId | undefined
}

/**
 * Structural view of the Mithril 2.x internal vnode fields read here. A
 * fragment-root component copies `dom`/`domSize` from its normalized `"["`
 * instance, so a component vnode reports the full width of its fragment.
 */
interface RenderedVnode {
  tag: unknown
  children?: unknown
  dom?: Node | null
  domSize?: number
  instance?: unknown
  state?: unknown
}

interface MutableRecord {
  readonly id: ComponentId
  readonly sourceId: SourceId
  latestVnode: RenderedVnode | null
}

function isComponentTag(tag: unknown): boolean {
  if (typeof tag === "function") return true
  return (
    tag !== null && typeof tag === "object" && typeof (tag as { view?: unknown }).view === "function"
  )
}

/**
 * Reads the DOM range Mithril recorded on a rendered vnode. Elements and text
 * leave `domSize` undefined (a single node); a fragment root records the first
 * rendered node in `dom` and the number of top-level nodes in `domSize`
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

export function createFragmentRegistry(): FragmentRegistry {
  let nextInstance = 0
  // vnode.state is the one object Mithril carries across redraws
  // (`vnode.state = old.state`), so it is the stable per-instance identity —
  // the component vnode itself is recreated every pass (ADR-103).
  const byState = new WeakMap<object, MutableRecord>()
  const byId = new Map<ComponentId, MutableRecord>()

  interface NodeEntry {
    generation: number
    owners: ComponentOwnership[]
  }
  const byNode = new WeakMap<Node, NodeEntry>()
  let generation = 0

  // The first touch of a node in an associateTree pass replaces its owner list;
  // nodes no longer rendered keep their last-known owners so a stale selection
  // can still be resolved to a component (§8.8).
  const register = (node: Node, owner: ComponentOwnership): void => {
    const entry = byNode.get(node)
    if (entry === undefined || entry.generation !== generation) {
      byNode.set(node, { generation, owners: [owner] })
    } else {
      entry.owners.push(owner)
    }
  }

  const registerRange = (range: DomRange, owner: ComponentOwnership): void => {
    let node: Node | null = range.first
    while (node !== null) {
      register(node, owner)
      if (node === range.last) break
      node = node.nextSibling
    }
  }

  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object") return
    if (Array.isArray(value)) {
      for (const child of value) visit(child)
      return
    }
    const vnode = value as RenderedVnode
    if (isComponentTag(vnode.tag)) {
      const state = vnode.state
      const record = typeof state === "object" && state !== null ? byState.get(state) : undefined
      if (record !== undefined) {
        record.latestVnode = vnode
        // Register every top-level node of the fragment with this component,
        // outermost-first: a nested component visited later pushes onto the
        // same nodes so the innermost owner wins in componentOf.
        registerRange(domRangeOf(vnode), { componentId: record.id, sourceId: record.sourceId })
      }
      // The rendered view result (element, fragment or nested component) lives
      // on `vnode.instance`.
      visit(vnode.instance)
      return
    }
    if (typeof vnode.tag === "string" && vnode.tag !== "#" && vnode.tag !== "<") {
      visit(vnode.children)
    }
  }

  return {
    instrumentView<Attrs, State, Result extends Children | null | void>(
      sourceId: SourceId,
      view: (this: State, vnode: Vnode<Attrs, State>) => Result,
    ): (this: State, vnode: Vnode<Attrs, State>) => Result {
      return function (this: State, vnode: Vnode<Attrs, State>): Result {
        const state: unknown = vnode.state
        if (typeof state === "object" && state !== null) {
          let record = byState.get(state)
          if (record === undefined) {
            nextInstance += 1
            record = { id: `c:${nextInstance}`, sourceId, latestVnode: null }
            byState.set(state, record)
            byId.set(record.id, record)
          }
          // The vnode passed to the view is the same object Mithril later
          // assigns `.dom`/`.domSize` to, so keep the freshest reference.
          record.latestVnode = vnode as unknown as RenderedVnode
        }
        return view.call(this, vnode)
      }
    },
    associateTree(rendered) {
      generation += 1
      visit(rendered)
    },
    componentOf(node) {
      for (let current: Node | null = node; current !== null; current = current.parentNode) {
        const owners = byNode.get(current)?.owners
        if (owners !== undefined && owners.length > 0) {
          return owners[owners.length - 1]
        }
      }
      return undefined
    },
    ownersOf(node) {
      return byNode.get(node)?.owners ?? []
    },
    rangeOf(id) {
      const record = byId.get(id)
      if (record === undefined || record.latestVnode === null) return { first: null, last: null }
      return domRangeOf(record.latestVnode)
    },
    idOf(state) {
      return byState.get(state)?.id
    },
  }
}
