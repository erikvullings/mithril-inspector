import type { DomRange } from "@mithril-inspector/protocol"

export type { DomRange }

/**
 * Structural view of the Mithril 2.x internal vnode fields the runtime reads
 * after a render pass. `dom`/`domSize` are assigned by `mithril/render`; a
 * fragment-root vnode copies them from its normalized `"["` instance, so a
 * component vnode reports the full width of its fragment (ADR-101/104).
 */
export interface RenderedVnode {
  dom?: Node | null
  domSize?: number
}

/**
 * Reads the DOM range Mithril recorded on a rendered vnode. Elements and text
 * leave `domSize` undefined (a single node); a fragment records the first
 * rendered node in `dom` and the count of top-level nodes in `domSize`
 * (`dom = null`, `domSize = 0` when it produced nothing). Walks `nextSibling`
 * to find the last node — never scans the whole document (§17).
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

/** Invokes `fn` for each top-level node of a range, first → last. */
export function eachRangeNode(range: DomRange, fn: (node: Node) => void): void {
  let node: Node | null = range.first
  while (node !== null) {
    fn(node)
    if (node === range.last) break
    node = node.nextSibling
  }
}
