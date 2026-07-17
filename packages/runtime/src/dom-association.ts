import type { SourceLocation } from "@mithril-inspector/protocol"

import { domRangeOf, eachRangeNode } from "./dom-range.js"
import type { SourceRegistry } from "./source-registry.js"

/** What a rendered DOM node resolves to: the nearest source expression (§7.6). */
export interface DomOwnership {
  readonly qualifiedId: string
}

/**
 * The vnode→source tagging and DOM node→source ownership map (ADR-101/104).
 * Tagging happens at `source()` call time (during view execution, before the
 * DOM exists); {@link DomAssociationRegistry.flush} runs after the render pass
 * to read each tagged vnode's `dom`/`domSize` and (re)build the node→source
 * map. All node keys are held weakly (§17).
 */
export interface DomAssociationRegistry {
  /**
   * Stamp a vnode with a qualified source id and queue it for association. The
   * vnode is returned unchanged — metadata lives in a `WeakMap`, never in
   * enumerable attrs (§6.2). Non-object values pass through untouched.
   */
  tag<T>(qualifiedId: string, vnode: T): T
  /** The qualified source id stamped on a vnode, if any. */
  sourceIdOfVnode(vnode: object): string | undefined
  /** Resolve a stamped vnode's source against the live registry, or `null`. */
  sourceOfVnode(vnode: object): SourceLocation | null
  /**
   * Read every queued vnode's DOM range and rebuild the node→source ownership
   * map. Idempotent per batch; the queue is cleared afterwards. Called from a
   * batched microtask after each render pass (§9.4), or directly in tests.
   */
  flush(): void
  /** Resolve the nearest source location for a DOM node (the picker path, §16). */
  resolveDomSource(node: Node): SourceLocation | null
  /** All source ownerships registered for a node, outermost → innermost. */
  ownershipsOf(node: Node): readonly DomOwnership[]
  /** Exclude an overlay host (and its subtree) from tracking (§8.2). */
  excludeHost(host: Node): void
  /** Whether any tagged vnodes are queued for the next flush. */
  hasPending(): boolean
  /** Nodes associated in the last flush (rebuilt each flush; for snapshots). */
  associatedNodes(): readonly Node[]
  /**
   * Drop pending tags and the current associated-nodes set (§9.4 `reset`,
   * task 0021 full-invalidation). Per-vnode source stamps (`tag`) already
   * live in a `WeakMap` keyed by vnode object, so they need no explicit
   * clearing — a vnode not re-rendered after a reset is simply never
   * re-queued.
   */
  reset(): void
}

interface NodeEntry {
  generation: number
  ownerships: DomOwnership[]
}

export function createDomAssociationRegistry(sources: SourceRegistry): DomAssociationRegistry {
  // §6.2: vnode metadata is held in a WeakMap, never as an enumerable attr.
  const vnodeSource = new WeakMap<object, string>()
  const byNode = new WeakMap<Node, NodeEntry>()
  const excludedHosts = new Set<Node>()
  let pending: object[] = []
  // A fresh strong set of on-screen associated nodes, rebuilt each flush so it
  // stays bounded by the current DOM; the WeakMap additionally retains removed
  // nodes' last-known ownership for stale-selection resolution (§8.8).
  let associated = new Set<Node>()
  let generation = 0

  const isUnderExcludedHost = (node: Node): boolean => {
    if (excludedHosts.size === 0) return false
    for (let current: Node | null = node; current !== null; current = current.parentNode) {
      if (excludedHosts.has(current)) return true
    }
    return false
  }

  // First touch of a node in a flush replaces its ownership list; nodes no
  // longer rendered keep their last-known entry until garbage-collected.
  const register = (node: Node, ownership: DomOwnership): void => {
    const entry = byNode.get(node)
    if (entry === undefined || entry.generation !== generation) {
      byNode.set(node, { generation, ownerships: [ownership] })
    } else {
      entry.ownerships.push(ownership)
    }
    associated.add(node)
  }

  return {
    tag(qualifiedId, vnode) {
      if (vnode !== null && typeof vnode === "object") {
        const target = vnode as object
        vnodeSource.set(target, qualifiedId)
        pending.push(target)
      }
      return vnode
    },
    sourceIdOfVnode(vnode) {
      return vnodeSource.get(vnode)
    },
    sourceOfVnode(vnode) {
      const qualifiedId = vnodeSource.get(vnode)
      if (qualifiedId === undefined) return null
      return sources.resolveSource(qualifiedId)
    },
    flush() {
      generation += 1
      associated = new Set()
      const batch = pending
      pending = []
      for (const vnode of batch) {
        const qualifiedId = vnodeSource.get(vnode)
        if (qualifiedId === undefined) continue
        const range = domRangeOf(vnode as { dom?: Node | null; domSize?: number })
        if (range.first === null || isUnderExcludedHost(range.first)) continue
        eachRangeNode(range, (node) => register(node, { qualifiedId }))
      }
    },
    resolveDomSource(node) {
      for (let current: Node | null = node; current !== null; current = current.parentNode) {
        if (excludedHosts.has(current)) return null
        const ownerships = byNode.get(current)?.ownerships
        if (ownerships !== undefined && ownerships.length > 0) {
          // Nearest owned node wins; try innermost → outermost. An owned node
          // whose source no longer resolves (HMR-invalidated) yields null
          // rather than falling through to an ancestor (§16).
          for (let index = ownerships.length - 1; index >= 0; index -= 1) {
            const ownership = ownerships[index]
            if (ownership === undefined) continue
            const location = sources.resolveSource(ownership.qualifiedId)
            if (location !== null) return location
          }
          return null
        }
      }
      return null
    },
    ownershipsOf(node) {
      return byNode.get(node)?.ownerships ?? []
    },
    excludeHost(host) {
      excludedHosts.add(host)
    },
    hasPending() {
      return pending.length > 0
    },
    associatedNodes() {
      return Array.from(associated)
    },
    reset() {
      pending = []
      associated = new Set()
      generation += 1
    },
  }
}
