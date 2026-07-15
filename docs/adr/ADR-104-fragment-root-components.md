# ADR-104: Fragment-root components

Status: accepted (validated by spike, TASKS/0005)
Date: 2026-07-15
Related: REQUIREMENTS.md §7.6, §8.8, §16, §20.1.9; ADR-101, ADR-103

## Context

A component whose view returns an array/fragment produces several root DOM
nodes rather than one. The inspector must select such a component through *any*
of its rendered nodes (§20.1.9) and represent its output as a single
`DomRange { first, last }` (§7.6). The range must stay correct as the fragment's
children are added, removed and reordered across redraws, and must cope with an
empty fragment (no DOM), fragments mixing text and elements, and the deferred
window of an async `onbeforeremove` (§8.8). This builds on the vnode→DOM
mechanism of ADR-101 and the instance identity of ADR-103; it is spiked
independently to prove those compose for the multi-root case.

## Decision

The prototype in `tests/fixtures/spikes/fragment-root-components/` validates
this mechanism against real `m.render` passes (Mithril 2.3.8, jsdom):

1. **Fragment width from the component vnode.** A component whose view returns
   an array is normalized by Mithril into a `"["` fragment `instance`, and the
   component vnode copies `dom` (the first rendered node) and `domSize` (the
   count of top-level nodes) from it. `domRangeOf` reads those exactly as
   ADR-101 does for any other vnode: `dom == null` or `domSize === 0` means no
   DOM, otherwise the range spans `domSize` contiguous siblings from `dom`.
2. **Node → component ownership map.** `associateTree` walks the rendered vnode
   tree after a render pass. At each component vnode it resolves the instance
   record and registers *every* top-level node of the component's range in a
   `WeakMap<Node, ComponentOwnership[]>`, carrying `{ componentId, sourceId }`.
   `componentOf` resolves a node by checking it and then its `parentNode`
   chain, so nodes nested below a fragment child still resolve to the component.
   A generation counter resets a node's owner list on its first touch per pass,
   so redraws never accumulate duplicates, while nodes that have left the DOM
   keep their last-known owner for stale-selection UX (§8.8). Owners are pushed
   outermost→innermost, so for nested fragment roots the innermost component
   wins.
3. **Identity and source marker at the definition site.** `instrumentView`
   (the spike stand-in for the transform-injected `__miView(sourceId, view)`,
   ADR-103) allocates a stable `c:${n}` id keyed on `vnode.state` — the one
   object Mithril carries across redraws — records the component's `sourceId`,
   and captures the current component vnode. No state, attrs or return value is
   mutated; the id is stable across redraws and the source marker travels with
   every one of the component's rendered nodes.
4. **DomRange read on demand.** `rangeOf(id)` reads `dom`/`domSize` from the
   captured component vnode each time it is called. Because Mithril updates
   those fields in place on every redraw and the fragment's nodes stay
   contiguous, the range follows child add/remove/reorder without any bookkeeping
   of its own, and during an async `onbeforeremove` the pre-removal vnode
   retains its width while the DOM stays attached.

## Verified Mithril 2.3.8 behaviors

- A component view returning a bare array yields `instance.tag === "["`; the
  component vnode's `domSize` equals the number of top-level rendered nodes and
  its `dom` is the first of them.
- An empty-array view yields `dom = null`, `domSize = 0`; the component claims
  no nodes and does not adopt its siblings' DOM.
- A fragment mixing strings, numbers and elements renders one text node per
  string/number and one node per element, all counted in `domSize`.
- Keyed reorder + insertion + removal updates the component vnode's `dom` and
  `domSize` in place; re-reading after the redraw gives the new first/last, and
  moved keyed nodes are relocated rather than recreated.
- An async `onbeforeremove` keeps the fragment attached until the returned
  promise resolves; throughout that window `dom`/`domSize` on the removed vnode
  are unchanged and its nodes stay connected, then `onremove`/detach follow.

## Rejected alternatives

- **Storing a snapshot range at association time.** Redundant: Mithril already
  maintains `dom`/`domSize` on the vnode every pass, so reading them on demand
  is both simpler and correct across redraws and deferred removal.
- **Registering only the first fragment node.** Would fail §20.1.9 — the
  component could not be selected through its other rendered nodes. Every
  top-level node must be registered.
- **Walking the DOM (`nextSibling` scan without `domSize`).** Cannot tell where
  a fragment ends when it is interleaved with sibling content; `domSize` bounds
  the walk exactly.
- **Keying identity on the component vnode.** Rejected in ADR-103: the vnode is
  recreated every redraw, so the range reference and id would both be lost. The
  state object is the stable carrier.

## Limitations and follow-ups

- Ownership registered here is the render-tree relation (nearest enclosing
  component of a node). The lexical owner used for the §9.1 component *tree* is
  ADR-103's concern; task 0017 reconciles the two.
- The spike drives `associateTree` with an explicit post-render walk. The real
  runtime (task 0010) must batch this per redraw from composed lifecycle hooks
  (task 0006) and scope registries per mount root.
- `rangeOf` holds a strong reference from the instance record to its latest
  component vnode (and thus its `dom`). Cleanup on unmount (§7.7) is task 0006;
  until then removed instances retain their last range for stale-selection UX.
- Verified on Mithril 2.3.8 only. The array-view → `"["`-fragment normalization
  and the `dom`/`domSize` copy from `instance` should be re-checked when the
  supported Mithril range changes.
