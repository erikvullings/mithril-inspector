# 0010 Runtime package: source registry and DOM association

Status: open
Priority: high
Owner: unassigned
Agent: claude-opus
Area: runtime
Depends on: 0002, 0005, 0006, 0008

## Context
REQUIREMENTS.md §4, §7: `@mithril-inspector/runtime` provides registration, vnode ownership and DOM association — no UI. Phase 1 scope (§21): source registry + DOM/source association so the overlay can resolve hovered elements to source locations. Exposes the single dev-only global hook `window.__MITHRIL_INSPECTOR__` (§7.1, protocolVersion 1) with `registerModule/registerComponent/registerVNode/associateDom/disposeVNode/subscribe/getSnapshot`.

## Acceptance Criteria
- Module/source registration store keyed by module ID; HMR-replaceable (re-register replaces stale records — protocol from 0007 feeds 0013).
- Vnode → source ID attachment via WeakMap/non-enumerable symbol (§6.2); DOM node → `DomOwnership[]` lookup via `WeakMap<Node, ...>` (§7.6) including nearest source expression; fragment ranges per 0005.
- Lifecycle wrapping per 0006 ADR: composed hooks preserve `this`, ordering, return values, async `onbeforeremove`; mappings cleaned on remove.
- Multiple application roots supported (§3.1); overlay host element excluded from tracking (§8.2).
- Application semantics preserved (§2.3): no attrs mutation, no wrapper DOM, no redraw interference — asserted in tests.
- Inspector errors caught at boundaries and never break the host app (§16); feature-level disable on repeated failure.
- Public runtime API stubs: `inspectComponent`, `inspectSource`, `setInspectorDisplayName`, `markInspectorHidden`, `setInspectorSerializer` (§14) — at least `inspectComponent`/`setInspectorDisplayName` functional in Phase 1.
- Vitest DOM tests (§19.1 runtime list): registration, DOM ranges, mount/update/remove, weak-map lookup, multiple roots, stale selections.

## Implementation Notes
- IDs per §7.2: component IDs stable across redraws; vnode IDs may change per vnode.
- Weak references throughout; stale records cleaned after unmount (§17).
- Performance: no full-page DOM scans on redraw; `mode: "source" | "components" | "full"` switch scaffolding (§17) — Phase 1 ships `source`.
- No Vite or bundler imports (ADR-004).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
