# ADR-101: Vnode-to-DOM association

Status: accepted (validated by spike, TASKS/0002)
Date: 2026-07-15
Related: REQUIREMENTS.md §6.2, §7.5, §7.6, §17; ADR-002, ADR-005

## Context

The inspector must associate an instrumented vnode with the DOM it produced
(`DomRange { first, last }`) and map any DOM node back to its most specific
source marker (`WeakMap<Node, DomOwnership[]>`). Mithril vnodes may render a
single element, a text node, trusted HTML, an array fragment, a component
rooted in any of those, or no DOM at all — and keyed redraws move DOM nodes
between vnodes. REQUIREMENTS.md §25 forbids building the UI before this
mechanism is proven.

## Decision

The prototype in `tests/fixtures/spikes/vnode-dom-association/` validates this
mechanism against real `m.render` passes (Mithril 2.3.8, jsdom):

1. **Tagging.** A `source(id, expr)` wrapper — the stand-in for the
   transform-injected `__miSource` call — records the vnode in a module-level
   `WeakMap<object, SourceId>` and returns it unchanged: no enumerable
   properties, no wrapper vnodes, no attrs mutation. Array expressions are
   normalized into a real `"["` fragment vnode (exactly what `Vnode.normalize`
   would create) and the fragment is tagged, because the array object itself
   loses its identity during Mithril's normalization. Primitive text
   expressions become a hand-built `"#"` vnode shaped like Mithril's `Vnode()`
   record; `Vnode.normalize` passes existing objects through untouched, so the
   tagged object survives and receives `.dom`.
2. **vnode → DOM.** After a render pass, `vnode.dom` and `vnode.domSize` are
   read directly: `dom == null` or `domSize === 0` means no DOM,
   `domSize === undefined` means a single node, otherwise the range spans
   `domSize` siblings starting at `vnode.dom`.
3. **DOM → source.** A pre-order walk of the rendered vnode tree (element and
   fragment `children`, component `instance`) registers each top-level node of
   a tagged vnode's range in a `WeakMap<Node, DomOwnership[]>`, ordered
   outermost → innermost. Lookups check the node, then its `parentNode` chain;
   the innermost (last) ownership wins, so an element marker beats the
   component-usage marker sharing its node. A generation counter resets a
   node's ownership list on its first touch of each association pass, so
   redraws do not accumulate duplicates, while nodes that left the DOM retain
   their last-known record for stale-selection UX (§8.8).

## Verified Mithril 2.3.8 behaviors

- `Vnode.normalize` passes pre-built vnode objects through unchanged.
- `hyperscript` does not fold a single text child into `vnode.text`; a tagged
  text vnode keeps its identity and receives its own `.dom`. (Re-verify on
  older 2.x releases before relying on this outside the spike.)
- Elements and text vnodes leave `domSize` undefined (one node). Fragments set
  `dom` to the first rendered node and `domSize` to the count (`dom = null`,
  `domSize = 0` when empty). Trusted HTML sets `domSize` to the parsed node
  count. Components copy `dom`/`domSize` from `instance` and set
  `domSize = 0` when the view returns null.
- Keyed redraws move existing DOM nodes onto the new render's vnodes, so
  re-associating after each pass stays correct across reorder, insertion and
  removal.

## Rejected alternatives

- **Enumerable attrs (`vnode.attrs.__source`).** Application code can
  enumerate or serialize attrs; forbidden by §6.2.
- **`data-*` DOM attributes by default.** Exposes filesystem paths, pollutes
  snapshots and CSS selectors; kept only as the optional diagnostic mode of
  §13 (ADR-002).
- **Globally monkey-patching `m` with call-stack interception.** Fragile with
  multiple Mithril instances and vnodes created outside views, and it cannot
  recover source lines (ADR-005).
- **Non-enumerable symbol property on vnodes.** Viable, but the `WeakMap`
  avoids mutating application objects entirely and works with frozen or
  proxied vnodes; the symbol remains a documented fallback (§6.2).
- **MutationObserver / DOM scanning.** Full-page scans violate the §17
  performance budget and cannot identify the producing source expression.

## Limitations and follow-ups

- The spike triggers association with an explicit post-render walk. The real
  runtime must drive it from composed lifecycle hooks (task 0006) and wrapped
  component views (task 0004), batched per redraw.
- Ownership entries hold a strong reference from a live DOM node to its vnode;
  the lifetime is bounded by the `WeakMap` key, and entries for removed nodes
  vanish when the node is garbage collected.
- The runtime package (task 0010) should scope registries per mount root and
  define how multiple roots share the generation counter.
- Fragment-root *components* — where a component vnode's `dom`/`domSize` is
  copied from a normalized `"["` instance — reuse this `domRangeOf` and the
  generation-guarded node map; ADR-104 (task 0005) validates that case and the
  reliability of `domSize` across redraws and async removal.
