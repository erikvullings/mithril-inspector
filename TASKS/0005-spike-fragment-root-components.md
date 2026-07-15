# 0005 Spike: fragment-root components

Status: done
Priority: high
Owner: unassigned
Agent: claude-opus
Area: spike
Depends on: 0001

## Context
Phase 0 spike 4 (REQUIREMENTS.md §21). Components returning arrays/fragments produce multiple root DOM nodes; the inspector must select such a component through any of its rendered nodes (MVP acceptance §20.1.9) and represent the output as `DomRange { first, last }` (§7.6).

## Acceptance Criteria
- Prototype maps every rendered node of a fragment-root component back to that component and its source ID.
- `DomRange` first/last stay correct after a redraw that adds/removes/reorders fragment children.
- Empty fragments (no DOM output) and fragments with mixed text/element children handled without errors.
- ADR written recording how fragment ranges are captured and maintained.

## Implementation Notes
- Builds conceptually on 0002's mechanism, but is listed as an independent spike — coordinate findings in both ADRs.
- Mithril `vnode.domSize` tracks fragment width; verify reliability during async removal (`onbeforeremove`).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
- 2026-07-15 claude-opus: Built the spike as a private workspace package at `tests/fixtures/spikes/fragment-root-components/`. Mechanism: `createFragmentRegistry()` composes ADR-101's `domRangeOf` + generation-guarded `WeakMap<Node, owner[]>` with ADR-103's state-keyed instance identity. `instrumentView(sourceId, view)` (stand-in for the transform's `__miView`) allocates a stable `c:${n}` id keyed on `vnode.state`, records the component's source marker, and captures the current component vnode; `associateTree` walks the rendered tree after a render pass and registers *every* top-level node of each component's `DomRange` with `{ componentId, sourceId }` (outermost→innermost, so nested fragment roots resolve to the innermost component); `componentOf` walks the `parentNode` chain so nodes below a fragment child still resolve; `rangeOf(id)` reads `dom`/`domSize` on demand from the captured vnode. Confirmed Mithril 2.3.8 behavior first via a throwaway probe (since deleted): an array-returning view normalizes to a `"["` instance and the component vnode copies its `dom`/`domSize`; empty array → `dom=null, domSize=0`; mixed text/number/element counts each node; async `onbeforeremove` keeps `dom`/`domSize` and connectivity intact through the deferred window. Verified with 7 TDD'd tests in `src/fragments.test.ts` (`vitest run`, real `m.render` under jsdom): every rendered node (incl. a nested descendant) maps to the component + source id with a correct first..last range; a redraw that reorders+adds+removes keyed fragment children keeps the range's first/last correct and the id stable; empty fragment yields an empty range and claims no siblings; mixed text/number/element fragment maps every node; `domSize`/range stay reliable and connected through an async `onbeforeremove` and detach after; nested fragment-root components resolve to the nearest component; state/attrs are not mutated across redraws. Package typecheck clean (`tsc -p tsconfig.json`); full workspace `pnpm -r typecheck` and `pnpm -r test` green (all sibling packages/spikes unaffected). ADR written at `docs/adr/ADR-104-fragment-root-components.md`, with a coordinating cross-reference added to ADR-101. Known limitations (see ADR): registered ownership is the render-tree relation (lexical tree owner is ADR-103/task 0017); association is an explicit post-render walk to be batched from lifecycle hooks by tasks 0006/0010; the instance record holds a strong ref to its latest vnode until unmount cleanup (task 0006); verified on Mithril 2.3.8 only.
