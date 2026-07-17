/**
 * Highlight geometry and animation-frame throttling (§8.6, §17).
 *
 * Rectangles are computed from `getBoundingClientRect`, i.e. in viewport
 * coordinates, so they can be drawn with `position: fixed` and automatically
 * follow scrolling. The inspected element's own styles are never touched — the
 * overlay draws separate rectangles above the page. Pointer, scroll and resize
 * work is coalesced to at most one update per animation frame.
 */

import type { DomRange } from "@mithril-inspector/protocol"

export interface HighlightRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1 && typeof (node as Element).getBoundingClientRect === "function"
}

/** The viewport rectangle for an element (for `position: fixed` overlays). */
export function rectOfElement(element: Element): HighlightRect {
  const box = element.getBoundingClientRect()
  return { left: box.left, top: box.top, width: box.width, height: box.height }
}

/**
 * One rectangle per element node in a range — a fragment-root component renders
 * several sibling nodes, each highlighted separately (§8.6). Non-element nodes
 * (text/comment) are skipped.
 */
export function rectsOfNodes(nodes: Iterable<Node>): HighlightRect[] {
  const rects: HighlightRect[] = []
  for (const node of nodes) {
    if (isElement(node)) rects.push(rectOfElement(node))
  }
  return rects
}

/**
 * Enumerate the top-level sibling nodes spanned by a component's
 * {@link DomRange} (first→last inclusive), for per-node highlighting of a
 * component's rendered range (§8.6, §9.3 "highlight its DOM range"). A
 * fragment-root component's range can span several sibling nodes.
 */
export function nodesOfDomRange(range: DomRange): Node[] {
  const { first, last } = range
  if (first === null) return []
  if (last === null || last === first) return [first]
  const nodes: Node[] = [first]
  let current: Node = first
  // A real range is a handful of siblings; cap the walk so a malformed range
  // (whose `last` is never reached via `nextSibling`) degrades to a partial
  // result instead of scanning the rest of the document.
  for (let i = 0; i < 10_000 && current !== last; i++) {
    const next = current.nextSibling
    if (next === null) break
    nodes.push(next)
    current = next
  }
  return nodes
}

/** One rect per element in a component's {@link DomRange} (§8.6, §9.3). */
export function rectsOfDomRange(range: DomRange): HighlightRect[] {
  return rectsOfNodes(nodesOfDomRange(range))
}

/** The union bounding box of several rectangles, or `null` when empty. */
export function boundingRect(rects: readonly HighlightRect[]): HighlightRect | null {
  if (rects.length === 0) return null
  let minLeft = Number.POSITIVE_INFINITY
  let minTop = Number.POSITIVE_INFINITY
  let maxRight = Number.NEGATIVE_INFINITY
  let maxBottom = Number.NEGATIVE_INFINITY
  for (const rect of rects) {
    minLeft = Math.min(minLeft, rect.left)
    minTop = Math.min(minTop, rect.top)
    maxRight = Math.max(maxRight, rect.left + rect.width)
    maxBottom = Math.max(maxBottom, rect.top + rect.height)
  }
  return { left: minLeft, top: minTop, width: maxRight - minLeft, height: maxBottom - minTop }
}

/** The animation-frame primitives the scheduler needs; injectable for tests. */
export interface RafHost {
  requestAnimationFrame(callback: (time: number) => void): number
  cancelAnimationFrame(handle: number): void
}

export interface FrameScheduler {
  /** Request a frame; repeated calls before the frame fires coalesce into one. */
  request(): void
  /** Cancel a pending frame without running the callback. */
  cancel(): void
  hasPending(): boolean
}

function defaultRafHost(): RafHost {
  const scope = globalThis as unknown as RafHost
  return {
    requestAnimationFrame: scope.requestAnimationFrame.bind(scope),
    cancelAnimationFrame: scope.cancelAnimationFrame.bind(scope),
  }
}

/**
 * Coalesce many `request()` calls into a single `callback` per animation frame
 * — the core of "one pointer update per animation frame" and "idle CPU near
 * zero" (§17): nothing is scheduled until something asks for a frame.
 */
export function createFrameScheduler(callback: () => void, host: RafHost = defaultRafHost()): FrameScheduler {
  let handle: number | null = null
  const run = (): void => {
    handle = null
    callback()
  }
  return {
    request() {
      if (handle !== null) return
      handle = host.requestAnimationFrame(run)
    },
    cancel() {
      if (handle === null) return
      host.cancelAnimationFrame(handle)
      handle = null
    },
    hasPending() {
      return handle !== null
    },
  }
}
