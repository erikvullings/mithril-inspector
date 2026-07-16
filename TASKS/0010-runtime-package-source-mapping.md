# 0010 Runtime package: source registry and DOM association

Status: done
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
- 2026-07-16 claude-opus: Implemented `@mithril-inspector/runtime`, composing the Phase 0 spikes into a shipping package (no Vite/bundler/mithril imports in source — ADR-004 verified by grep). Modules: `source-registry.ts` (ADR-106 HMR-replaceable module/source table keyed by `m:<hash>`, wholesale replace on re-register, `invalidateModule` tombstone, generation bump, expands the transform's compact records into protocol `SourceLocation`); `dom-range.ts` (`domRangeOf`/`eachRangeNode`, fragment `dom`/`domSize` walk); `dom-association.ts` (ADR-101/104 — `source()` stamps vnodes in a `WeakMap` (never enumerable attrs, §6.2), batched `flush()` reads each tagged vnode's DOM range and rebuilds `WeakMap<Node, DomOwnership[]>` with a per-flush generation so removed nodes keep a stale record; `resolveDomSource` walks the parent chain innermost-first and stops at excluded overlay hosts, returning `null` for HMR-invalidated ids); `components.ts` (ADR-103/104/105 — `instrument()` returns a fresh `Object.create(def)` composing view + all six hooks so `this`/args/return/ordering are preserved, helper methods inherited, async `onbeforeremove` delay intact, cleanup in `onremove finally`; instance identity keyed on `vnode.state`, parent/child scopes, DOM range per instance, node→component map via a root-walk flush, display-name/hidden/serializer overrides, batched `components-added`/`-removed` events); `errors.ts` (§16 boundary: catch→fallback, per-feature failure threshold → disable + `onDisable`, debug-log-once); `runtime.ts` (singleton wiring + `window.__MITHRIL_INSPECTOR__` protocol-1 hook with all seven methods + resolution API + `setMode`/`getMode` scaffolding + microtask flush scheduling + `getSnapshot`); `api.ts` (§14 `inspectComponent`/`setInspectorDisplayName` functional, `markInspectorHidden`/`setInspectorSerializer` store, `inspectSource` documented stub). Verified: 59 tests across 7 files, all green via `pnpm --filter @mithril-inspector/runtime exec vitest run` (source-registry 8, errors 7, dom-association 11, components 13, runtime 14, api 5, index 1) — covering registration/HMR, DOM ranges incl. fragment roots, mount/update/remove, weak-map lookup, multiple roots, stale selections, host exclusion, semantics-preserved (no attrs mutation / no wrapper DOM / view once per pass / helper-method preservation), error boundary, and the public API. Package `tsc --noEmit` clean and `pnpm -r typecheck`/`pnpm -r test` green across the whole workspace (all sibling packages + spikes unaffected; transform 60 tests still pass). Added `packages/runtime/README.md` documenting the transform contract, the global hook, the resolution API and Phase-1 limitations. Known Phase-1 limitations (see README): class/standalone-`function` component *declarations* are registered for display names but not lifecycle-wrapped (object/closure forms are; the transform emits `__miComponent(id, Name)` as a discarded statement for declarations, so return-replacement isn't possible — deferred with ADR-105); `mode` is scaffolding only; `inspectSource` and the per-node vnode ids synthesized in `getSnapshot().domAssociations` are placeholders. Follow-ups for later tasks: 0021 (batched tree events beyond added/removed), 0019 (ancestry panel consuming `resolveDomComponent`/parent-child), 0020 (safe serializer/redaction the `setInspectorSerializer` hook stores for).
