import type { ComponentId, SourceLocation } from "@mithril-inspector/protocol"

import { describeMapping, type MappingInfo } from "./mapping.js"

/**
 * The selected element and its stale-node handling (§8.8).
 *
 * When a selection is removed by a redraw, the overlay must keep showing the
 * captured component/source record, report "Element no longer mounted", and
 * offer to reselect the nearest still-mounted ancestor — all without holding
 * strong references that would pin removed nodes in memory. The node and its
 * ancestor chain are therefore held as {@link WeakRef}s; only the plain source
 * data is retained strongly.
 */

export interface SelectionData {
  readonly source: SourceLocation | null
  readonly componentId: ComponentId | null
}

export interface SelectionSnapshot {
  /** The selected element if still reachable, else `null` (may have been GC'd). */
  readonly node: Element | null
  /** `true` while the node is still attached to the document. */
  readonly connected: boolean
  /** `true` when a selection exists but its node is no longer mounted (§8.8). */
  readonly stale: boolean
  readonly source: SourceLocation | null
  readonly componentId: ComponentId | null
  readonly mapping: MappingInfo
}

export interface SelectionModel {
  select(node: Element, data: SelectionData): void
  clear(): void
  hasSelection(): boolean
  snapshot(): SelectionSnapshot
  /** The nearest captured ancestor still attached to the document, or `null`. */
  nearestMountedAncestor(): Element | null
  /** Reselect the nearest mounted ancestor (§8.8); `false` if none is available. */
  promoteToNearestAncestor(): boolean
}

const EMPTY_MAPPING = describeMapping(null)

const EMPTY_SNAPSHOT: SelectionSnapshot = {
  node: null,
  connected: false,
  stale: false,
  source: null,
  componentId: null,
  mapping: EMPTY_MAPPING,
}

/** Resolves fresh selection data for a promoted ancestor node. */
export type SelectionResolver = (node: Element) => SelectionData

function captureAncestors(node: Element): WeakRef<Element>[] {
  const refs: WeakRef<Element>[] = []
  for (let current = node.parentElement; current !== null; current = current.parentElement) {
    refs.push(new WeakRef(current))
  }
  return refs
}

export function createSelectionModel(resolve?: SelectionResolver): SelectionModel {
  let nodeRef: WeakRef<Element> | null = null
  let ancestorRefs: WeakRef<Element>[] = []
  let source: SourceLocation | null = null
  let componentId: ComponentId | null = null

  const apply = (node: Element, data: SelectionData): void => {
    nodeRef = new WeakRef(node)
    ancestorRefs = captureAncestors(node)
    source = data.source
    componentId = data.componentId
  }

  const nearestMountedAncestor = (): Element | null => {
    for (const ref of ancestorRefs) {
      const ancestor = ref.deref()
      if (ancestor !== undefined && ancestor.isConnected) return ancestor
    }
    return null
  }

  return {
    select(node, data) {
      apply(node, data)
    },
    clear() {
      nodeRef = null
      ancestorRefs = []
      source = null
      componentId = null
    },
    hasSelection() {
      return nodeRef !== null
    },
    snapshot() {
      if (nodeRef === null) return EMPTY_SNAPSHOT
      const node = nodeRef.deref() ?? null
      const connected = node !== null && node.isConnected
      return {
        node,
        connected,
        stale: !connected,
        source,
        componentId,
        mapping: describeMapping(source),
      }
    },
    nearestMountedAncestor,
    promoteToNearestAncestor() {
      const ancestor = nearestMountedAncestor()
      if (ancestor === null) return false
      const data = resolve?.(ancestor) ?? { source: null, componentId: null }
      apply(ancestor, data)
      return true
    },
  }
}
