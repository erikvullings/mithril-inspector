import type { ComponentId, DomRange } from "@mithril-inspector/protocol"

import { nodesOfDomRange } from "./highlight.js"

/**
 * The Elements pane's tree-building logic (task 0031, §9.1's optional
 * "expansion of a component into its owned vnode/element tree"). Deliberately
 * separate from `tree.ts`'s component-only `ComponentTreeStore`: that store's
 * row model is keyed purely by `ComponentId` and its whole point is *hiding*
 * DOM/element nodes, so splicing a heterogeneous DOM walk into it would mean
 * reworking its id scheme for what §9.1 itself calls optional. This module
 * instead starts a fresh walk from a component's own `domRange` (already
 * exposed on `ComponentRecord`) on demand, only when a component is selected
 * and the Elements tab is open.
 */

/** One of a component's direct children (`ComponentRecord.childIds`, resolved) — only the fields this module needs. */
export interface ChildRecordLike {
  readonly id: ComponentId
  readonly displayName: string
  readonly domRange: DomRange | null
}

/**
 * Where a direct child component's own rendered range begins (and ends) within
 * its parent's DOM — the walk below stops descending once it reaches `first`
 * and renders a link chip instead, per the design's decision to represent
 * nested components as links back into the Components tree rather than more
 * raw markup.
 */
export interface ChildBoundary {
  readonly componentId: ComponentId
  readonly displayName: string
  /** The child's own last rendered sibling node (its range may span several, a fragment-root component) — `null` when unresolved (mirrors `DomRange.last`). */
  readonly last: Node | null
}

/** Build a `Node -> ChildBoundary` lookup from a component's direct children, skipping any with no resolvable DOM. */
export function buildChildBoundaries(children: readonly ChildRecordLike[]): ReadonlyMap<Node, ChildBoundary> {
  const map = new Map<Node, ChildBoundary>()
  for (const child of children) {
    const first = child.domRange?.first ?? null
    if (first === null) continue
    map.set(first, { componentId: child.id, displayName: child.displayName, last: child.domRange?.last ?? null })
  }
  return map
}

export type ElementsPaneNode =
  | {
      readonly kind: "element"
      readonly tag: string
      readonly id: string | null
      readonly classes: readonly string[]
      readonly children: readonly ElementsPaneNode[]
    }
  | { readonly kind: "text"; readonly text: string }
  /** A direct child component's own rendered range, rendered as a link rather than descended into (see {@link ChildBoundary}). */
  | { readonly kind: "component"; readonly componentId: ComponentId; readonly displayName: string }

export interface ElementsTreeResult {
  readonly nodes: readonly ElementsPaneNode[]
  /** `true` once `maxNodes` or `maxDepth` cut the walk short — the view shows a truncation notice rather than pretending the tree is complete. */
  readonly truncated: boolean
}

export interface ElementsWalkLimits {
  /** Total element/text/component nodes rendered across the whole tree, mirroring the defensive-cap instinct behind `nodesOfDomRange`'s own `10_000`-iteration guard, scaled down for what's actually usable in a docked panel. */
  readonly maxNodes: number
  /** Maximum nesting depth walked below the selected component's own top-level range. */
  readonly maxDepth: number
}

export const DEFAULT_ELEMENTS_WALK_LIMITS: ElementsWalkLimits = { maxNodes: 500, maxDepth: 40 }

const MAX_TEXT_PREVIEW_LENGTH = 40

function truncateText(text: string): string {
  return text.length > MAX_TEXT_PREVIEW_LENGTH ? `${text.slice(0, MAX_TEXT_PREVIEW_LENGTH)}…` : text
}

interface Budget {
  remaining: number
}

/**
 * Walk one level of siblings (top-level `nodesOfDomRange` result, or an
 * element's own `childNodes`), threading a single shared `budget` through
 * every recursive call so the `maxNodes` cap applies to the tree as a whole,
 * not per-level. Comment nodes (and anything else that isn't an element or a
 * non-blank text node) are silently skipped — neither counted against the
 * budget nor rendered — since they carry nothing meaningful for "what did
 * this component render."
 */
function walkSiblings(
  nodes: readonly Node[],
  boundaries: ReadonlyMap<Node, ChildBoundary>,
  depth: number,
  budget: Budget,
  limits: ElementsWalkLimits,
): { readonly nodes: ElementsPaneNode[]; readonly truncated: boolean } {
  const out: ElementsPaneNode[] = []
  let truncated = false
  let index = 0
  while (index < nodes.length) {
    if (budget.remaining <= 0) {
      truncated = true
      break
    }
    const node = nodes[index]!
    const boundary = boundaries.get(node)
    if (boundary !== undefined) {
      budget.remaining -= 1
      out.push({ kind: "component", componentId: boundary.componentId, displayName: boundary.displayName })
      if (boundary.last === null || boundary.last === node) {
        index += 1
      } else {
        // A fragment-root child spans several of *this* level's siblings —
        // skip every one of them (not just its first node), or the rest of
        // its own range would leak back out as if it were plain DOM owned by
        // the component we're actually inspecting. A malformed range whose
        // `last` never turns up degrades to skipping just the one node
        // rather than scanning the remainder of the list, mirroring
        // `nodesOfDomRange`'s own "degrade to a partial result" philosophy.
        let skipTo = index + 1
        while (skipTo < nodes.length && nodes[skipTo] !== boundary.last) skipTo += 1
        index = skipTo < nodes.length ? skipTo + 1 : index + 1
      }
      continue
    }
    if (node.nodeType === 1) {
      const element = node as Element
      budget.remaining -= 1
      const tag = element.tagName.toLowerCase()
      const id = element.id.length > 0 ? element.id : null
      const classes = Array.from(element.classList)
      if (depth >= limits.maxDepth) {
        truncated = true
        out.push({ kind: "element", tag, id, classes, children: [] })
      } else {
        const childResult = walkSiblings(Array.from(element.childNodes), boundaries, depth + 1, budget, limits)
        out.push({ kind: "element", tag, id, classes, children: childResult.nodes })
        if (childResult.truncated) truncated = true
      }
    } else if (node.nodeType === 3) {
      const text = (node.textContent ?? "").trim()
      if (text.length > 0) {
        budget.remaining -= 1
        out.push({ kind: "text", text: truncateText(text) })
      }
    }
    // Anything else (comment, etc.) is skipped without consuming budget.
    index += 1
  }
  return { nodes: out, truncated }
}

/**
 * Build the Elements pane's tree for a selected component's own `domRange`
 * (§9.1's optional per-component DOM/vnode expansion). Starts from
 * `nodesOfDomRange` (the same top-level-sibling walk `highlight.ts` already
 * uses for fragment highlighting) and recurses into each element's
 * `childNodes`, stopping at any node that is a direct child component's own
 * `domRange.first` (see {@link buildChildBoundaries}) rather than rendering
 * that child's markup twice.
 */
export function buildElementsTree(
  range: DomRange,
  boundaries: ReadonlyMap<Node, ChildBoundary>,
  limits: ElementsWalkLimits = DEFAULT_ELEMENTS_WALK_LIMITS,
): ElementsTreeResult {
  const topNodes = nodesOfDomRange(range)
  const budget: Budget = { remaining: limits.maxNodes }
  const result = walkSiblings(topNodes, boundaries, 0, budget, limits)
  return { nodes: result.nodes, truncated: result.truncated }
}

/**
 * Format an element as mithril hyperscript shorthand (§9.1's own "owned
 * vnode/element tree" wording), e.g. `div.scroll` or, with `showTagName` off
 * (a Settings-tab preference — `div` is mithril's own implicit default tag),
 * `.scroll`. Never renders a fully blank label: a bare `<div>` with no id or
 * class still shows its tag name even with `showTagName` off, rather than
 * disappearing into empty text.
 */
export function formatElementLabel(tag: string, id: string | null, classes: readonly string[], showTagName: boolean): string {
  const idSuffix = id !== null && id.length > 0 ? `#${id}` : ""
  const classSuffix = classes.map((c) => `.${c}`).join("")
  const label = `${showTagName ? tag : ""}${idSuffix}${classSuffix}`
  return label.length > 0 ? label : tag
}
