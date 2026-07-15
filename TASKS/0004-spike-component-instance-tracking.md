# 0004 Spike: component instance tracking without touching vnode.state

Status: done
Priority: high
Owner: unassigned
Agent: claude-fable
Area: spike
Depends on: 0001

## Context
Phase 0 spike 3 (REQUIREMENTS.md §21). Track mounted component instances — stable `ComponentId` for the life of the instance (§7.2), parent/child relationships — without replacing or mutating `vnode.state`, mutating attrs, or altering lifecycle ordering (§2.3, §7.7). Needed for Phase 2 component ancestry (0017) but the mechanism must be proven before the runtime architecture solidifies.

## Acceptance Criteria
- Prototype demonstrates a stable instance ID across multiple redraws for object, closure, and class components (§6.5 forms).
- Parent-child component relationships recovered for a nested tree (component ownership scopes per §7.5: `enterComponent`/`leaveComponent` around the wrapped view).
- `vnode.state` is provably untouched (identity check in test); application attrs unmodified; lifecycle hooks fire in original order with original `this` and return values.
- Keyed-list reorder keeps IDs attached to the right instances.
- ADR written describing the wrapping mechanism (view-boundary wrapper vs lifecycle injection) and its constraints.

## Implementation Notes
- WeakMap keyed on the component state object or on the vnode is the likely carrier — verify which object is stable across redraws in Mithril 2.x.
- Do not globally monkey-patch `m` (ADR-005); use build-time markers + controlled runtime wrappers.
- Multiple application roots must not confuse instance tracking (§3.1).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
- 2026-07-15 claude-fable: Built the spike as a private workspace package at `tests/fixtures/spikes/component-instance-tracking/`. Mechanism: `createInstanceRegistry().instrumentView(declId, view)` — the stand-in for the transform-emitted `__miView` wrapper at the view's *definition site* (object literal `view:`, closure's returned literal, class prototype method) — keys a `WeakMap<object, record>` on `vnode.state`, which Mithril 2.3.8 verifiably carries across redraws (`vnode.state = old.state`) while recreating the vnode itself; parent/child comes from §7.5 `enterComponent`/`leaveComponent` scopes around the wrapped view plus a first-tagger-wins walk of the raw view result tagging child component vnodes with their lexical owner. Verified with 9 TDD'd tests in `src/tracking.test.ts` (`vitest run` in the package, real `m.render` under jsdom) covering: stable ids across redraws for object/closure/class forms; nested-tree parent/child across all three forms with no redraw duplication; closure state identity (`vnode.state` is exactly the object the factory returned, no own-key changes) and intact class prototype chain; attrs untouched; lifecycle log parity with an uninstrumented baseline (oninit/oncreate/onbeforeupdate incl. `false` skip/onupdate/async onbeforeremove/onremove, original `this` throughout); keyed reorder with insertion+removal keeping ids on the right instances; two application roots with non-crossing parent chains; lexical ownership for children passed through a wrapper component. Two registry mutations (ownership last-wins; id reallocation per redraw) were confirmed to fail 1 and 6 tests respectively. Package typecheck and `pnpm -r build/test/typecheck` clean. ADR written at `docs/adr/ADR-103-component-instance-tracking.md`. Known limitations (see ADR): id allocation is lazy (first view call), removed-instance records are retained and `childIds` is creation-ordered (cleanup/ordering are tasks 0006/0017), untransformed-dependency components get no record, verified on Mithril 2.3.8 only.
