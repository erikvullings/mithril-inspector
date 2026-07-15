# 0002 Spike: vnode-to-DOM association

Status: done
Priority: high
Owner: unassigned
Agent: claude-fable
Area: spike
Depends on: 0001

## Context
Phase 0 spike 1 (REQUIREMENTS.md §21). Core uncertainty: reliably associate an instrumented vnode with its resulting DOM node or range after Mithril renders. §7.6 requires representing output as a `DomRange { first, last }` (single element, text node, trusted HTML, array fragment, component with multiple root nodes, no DOM, temporarily detached DOM) and a `WeakMap<Node, DomOwnership[]>` from DOM node back to source/vnode/component. §25 forbids building the full UI before this spike succeeds.

## Acceptance Criteria
- Isolated prototype (e.g. under `tests/fixtures/spikes/` or a scratch app) demonstrates: given a vnode tagged with a source ID, after render the correct DOM node(s) can be looked up, and given a DOM node the source ID can be recovered.
- Covers: single element, text vnode, array fragment, keyed list after reorder, vnode with no DOM output.
- Metadata attached via `WeakMap` or non-enumerable symbol — never an enumerable attr like `vnode.attrs.__source` (§6.2).
- Short ADR written (e.g. `docs/adr/ADR-101-vnode-dom-association.md`) recording the chosen mechanism and rejected alternatives.

## Implementation Notes
- Do not rely solely on call-stack interception of a global `m` (§7.5, ADR-005) — prefer source markers plus wrapped view boundaries.
- Mithril 2.x internals: `vnode.dom` and `vnode.domSize` are the natural hooks; verify behavior for fragments and components.
- Keep references weak so GC is not prevented (§17).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
- 2026-07-15 claude-fable: Built the spike as a private workspace package at `tests/fixtures/spikes/vnode-dom-association/` (added `tests/fixtures/spikes/*` to the pnpm workspace). `source(id, expr)` tags vnodes in a `WeakMap<object, SourceId>` (identity for vnodes; arrays become tagged `"["` fragment vnodes; primitives become hand-built `"#"` text vnodes that survive `Vnode.normalize`); `domRangeOf` reads `vnode.dom`/`domSize`; `createDomRegistry` walks the rendered tree (children + component `instance`) into a generation-versioned `WeakMap<Node, DomOwnership[]>` with innermost-wins parent-chain lookup. Verified with 9 TDD'd tests in `src/association.test.ts` (via `vitest run` in the package, real `m.render` under jsdom, Mithril 2.3.8) covering single element, untagged-descendant resolution, text vnode, array fragment with nested override, component usage + view element on the same node, keyed reorder with insertion/removal (no duplicate ownerships, stale record retained), no-DOM component, trusted HTML spanning two nodes, and no-enumerable-metadata identity. Package typecheck and `pnpm -r build/test/typecheck` clean. ADR written at `docs/adr/ADR-101-vnode-dom-association.md`. Known limitations (see ADR): association runs as an explicit post-render walk (lifecycle-hook integration is task 0006); single-text-child non-folding verified on 2.3.8 only. Also fixed two 0001 scaffold bugs found along the way: `vitest.workspace.ts` used the config-object shape that Vitest rejects in workspace files (root aggregate run never worked; now a plain project-glob array), and README.md/CLAUDE.md contained literal `\`` escapes.
