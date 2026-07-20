import type { ComponentId } from "@mithril-inspector/protocol"

/**
 * Redraw-flash detection (task 0030): "did this component's own DOM actually
 * mutate this redraw" — not "did its `view()` run", which fires unconditionally
 * every redraw regardless of whether Mithril's diff touched anything. Mithril
 * itself already computes the real signal (its diff only mutates DOM where the
 * new/old vnode trees actually differ), so this module's only job is mapping a
 * batch of already-observed DOM mutations back to the components that own the
 * mutated nodes — the actual observation (`MutationObserver`) and rAF
 * throttling live in `overlay.ts`, which owns real browser APIs.
 */

/**
 * Structural subset of a real `MutationRecord` — deliberately not the DOM type
 * itself, since `MutationRecord` has no public constructor and can't be built
 * directly in tests (mirrors this file's existing `ClickEvent`-style testable
 * structural interfaces in `controller.ts`).
 */
export interface DomMutationLike {
  readonly target: Node
  readonly addedNodes: ArrayLike<Node>
}

/**
 * Resolve a batch of mutation records to the set of components whose own DOM
 * actually changed. `target` covers the common case — content added, removed,
 * or patched (attribute/text) within a stable container, resolved by walking
 * up to the nearest owning component exactly like the DOM picker does. Each
 * mutation's `addedNodes` are *also* resolved directly to catch a component's
 * own top-level node being replaced wholesale: that `childList` mutation's
 * `target` is the component's *parent* (Mithril inserts the new node as a
 * child of whatever DOM element contains the component, not of the
 * component's own — now-detached — old node), so resolving only on `target`
 * would misattribute the flash to the parent's owner instead of the component
 * itself. Results are unioned, not preferred one over the other, since both a
 * container and a freshly-replaced child can legitimately have "actually
 * mutated" in the same batch.
 */
export function componentsWithMutatedDom(
  records: readonly DomMutationLike[],
  resolveDomComponent: (node: Node) => ComponentId | null,
): Set<ComponentId> {
  const ids = new Set<ComponentId>()
  for (const record of records) {
    const targetId = resolveDomComponent(record.target)
    if (targetId !== null) ids.add(targetId)
    for (let index = 0; index < record.addedNodes.length; index += 1) {
      const node = record.addedNodes[index]
      if (node === undefined) continue
      const addedId = resolveDomComponent(node)
      if (addedId !== null) ids.add(addedId)
    }
  }
  return ids
}
