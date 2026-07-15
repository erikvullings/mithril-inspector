# 0004 Spike: component instance tracking without touching vnode.state

Status: open
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
