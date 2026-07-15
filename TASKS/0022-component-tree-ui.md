# 0022 Phase 3: full component tree UI

Status: open
Priority: medium
Owner: unassigned
Agent: claude-opus
Area: overlay
Depends on: 0018, 0019, 0020, 0021

## Context
REQUIREMENTS.md §9 and §21 Phase 3: expandable component tree in the overlay's Components tab — a Mithril component tree, not a DOM tree — with selection synchronization, search, attrs/state views (via 0020's serializer), fed by batched events (0021).

## Acceptance Criteria
- Tree shows the component hierarchy with display names and keys (e.g. `UserCard key="42"`); plain HTML elements excluded by default, optional expansion of a component into its owned vnode/element tree (§9.1).
- Selection sync (§9.3): DOM pick selects nearest component in the tree; tree selection highlights the DOM range, offers scroll-into-view, shows source/attrs/state, and opens declaration or view source (multi-target "Open:" chooser, most precise default).
- Incremental updates from `RuntimeEvent` batches — no full rebuild per redraw (§9.4); update counters visible per component (§3.2).
- Component search by name; pinned components (§3.2) may be minimal but must not be silently dropped — document if deferred.
- Attrs/state panels use the lazy preview tree: expandable, paginated, getter-on-demand, redacted values shown as `[redacted]`.
- `componentTree.captureAttrs` / `captureState` and `mode: "full"` options respected (§11.1, §17).
- Browser tests: tree renders for the playground, selection sync both directions, keyed reorder keeps tree/DOM association correct.
- Accessibility per §18 applies to the tree (keyboard expand/collapse/navigate, focus indicators).

## Implementation Notes
- Update the Phase-1 placeholder Components tab from 0012.
- Stale/unmounted entries follow §8.8 semantics.
- Performance: virtualize or lazily render large trees; idle CPU near zero (§17).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
