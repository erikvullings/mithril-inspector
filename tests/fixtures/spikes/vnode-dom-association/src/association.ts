import m from "mithril"
import type { Children, Vnode } from "mithril"

export type SourceId = string

export interface DomRange {
  first: Node | null
  last: Node | null
}

export interface DomOwnership {
  readonly sourceId: SourceId
  readonly vnode: object
}

export interface DomRegistry {
  associateTree(rendered: Children): void
  ownershipsOf(node: Node): readonly DomOwnership[]
  resolveSource(node: Node): DomOwnership | undefined
}

/**
 * Structural view of the Mithril 2.x internal vnode fields this spike reads.
 * `dom`, `domSize` and `instance` are assigned by `mithril/render` during a
 * render pass; `children` holds normalized child vnodes for elements and
 * fragments, and a plain string for text ("#") and trusted HTML ("<") vnodes.
 */
interface RenderedVnode {
  tag: unknown
  children?: unknown
  dom?: Node | null
  domSize?: number
  instance?: unknown
}

const sourceIds = new WeakMap<object, SourceId>()

/**
 * Tags a vnode with a source ID, simulating what the build-time transform's
 * injected `__miSource(id, expr)` wrapper would do. Metadata lives in a
 * `WeakMap` keyed by the vnode object itself — never in enumerable attrs —
 * and the vnode is returned unchanged so application semantics are preserved.
 */
export function source(sourceId: SourceId, child: Children): Children {
  if (child === null || child === undefined || typeof child === "boolean") return child
  if (typeof child === "string" || typeof child === "number") {
    const text = createTextVnode(String(child))
    sourceIds.set(text, sourceId)
    return text
  }
  if (Array.isArray(child)) {
    // Mithril would normalize the array into a fresh "[" fragment vnode,
    // losing the array's identity — so build that fragment here and tag it.
    const fragment = m("[", ...child)
    sourceIds.set(fragment, sourceId)
    return fragment
  }
  sourceIds.set(child, sourceId)
  return child
}

/**
 * Builds a text vnode shaped exactly like Mithril 2.3.x `Vnode("#", ...)`.
 * `Vnode.normalize` passes existing vnode objects through untouched, so this
 * object survives normalization and receives `.dom` when the text node is
 * created — a plain string would be replaced by a fresh, untaggable vnode.
 */
function createTextVnode(text: string): Vnode {
  return {
    tag: "#",
    key: undefined,
    attrs: undefined,
    children: text,
    text: undefined,
    dom: undefined,
    is: undefined,
    domSize: undefined,
    state: undefined,
    events: undefined,
    instance: undefined,
  } as unknown as Vnode
}

export function getSourceId(value: object): SourceId | undefined {
  return sourceIds.get(value)
}

/**
 * Reads the DOM range Mithril recorded on a rendered vnode. Elements and text
 * vnodes leave `domSize` undefined (a single node); fragments, trusted HTML
 * and components record the number of top-level rendered nodes.
 */
export function domRangeOf(vnode: object): DomRange {
  const rendered = vnode as RenderedVnode
  const first = rendered.dom ?? null
  if (first === null || rendered.domSize === 0) return { first: null, last: null }
  const size = rendered.domSize ?? 1
  let last: Node = first
  for (let index = 1; index < size; index += 1) {
    const next: Node | null = last.nextSibling
    if (next === null) break
    last = next
  }
  return { first, last }
}

export function createDomRegistry(): DomRegistry {
  interface NodeEntry {
    generation: number
    ownerships: DomOwnership[]
  }

  const byNode = new WeakMap<Node, NodeEntry>()
  let generation = 0

  // The first touch of a node in a new associateTree pass replaces its
  // ownership list; nodes no longer rendered keep their last-known entries
  // so a stale selection can still be explained to the user.
  const register = (node: Node, ownership: DomOwnership): void => {
    const entry = byNode.get(node)
    if (entry === undefined || entry.generation !== generation) {
      byNode.set(node, { generation, ownerships: [ownership] })
    } else {
      entry.ownerships.push(ownership)
    }
  }

  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object") return
    if (Array.isArray(value)) {
      for (const child of value) visit(child)
      return
    }
    const vnode = value as RenderedVnode
    const sourceId = sourceIds.get(vnode)
    if (sourceId !== undefined) {
      const { first, last } = domRangeOf(vnode)
      let node: Node | null = first
      while (node !== null) {
        register(node, { sourceId, vnode })
        if (node === last) break
        node = node.nextSibling
      }
    }
    if (typeof vnode.tag === "string") {
      if (vnode.tag !== "#" && vnode.tag !== "<") visit(vnode.children)
    } else {
      // Component vnode: the rendered view result lives on `vnode.instance`.
      visit(vnode.instance)
    }
  }

  return {
    associateTree(rendered) {
      generation += 1
      visit(rendered)
    },
    ownershipsOf(node) {
      return byNode.get(node)?.ownerships ?? []
    },
    resolveSource(node) {
      for (let current: Node | null = node; current !== null; current = current.parentNode) {
        const ownerships = byNode.get(current)?.ownerships
        if (ownerships !== undefined && ownerships.length > 0) {
          return ownerships[ownerships.length - 1]
        }
      }
      return undefined
    },
  }
}
