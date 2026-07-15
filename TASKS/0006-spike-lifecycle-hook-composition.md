# 0006 Spike: lifecycle hook composition

Status: done
Priority: high
Owner: unassigned
Agent: claude-opus
Area: spike
Depends on: 0001

## Context
Phase 0 spike 5 (REQUIREMENTS.md §21). The runtime must wrap/inject Mithril lifecycle hooks (`oninit`, `oncreate`, `onbeforeupdate`, `onupdate`, `onbeforeremove`, `onremove`) without observable change to the application (§7.7): call existing hooks, preserve `this`, return values, ordering; don't swallow exceptions; don't modify `vnode.state`; clean mappings on removal. Async `onbeforeremove` must remain intact.

## Acceptance Criteria
- Prototype wraps all six hooks on a fixture component; a test asserts original hooks receive correct `this`, arguments, and that return values pass through (especially `onbeforeupdate` returning `false` and `onbeforeremove` returning a Promise that delays removal).
- Exceptions thrown by application hooks propagate unchanged.
- Inspector mappings are cleaned in `onremove` without interfering with application `onremove`.
- ADR written on the composition strategy (wrap on vnode vs on component definition) and its edge cases.

## Implementation Notes
- Hooks can live on the component definition AND on the vnode (attrs hooks) in Mithril; both paths must compose.
- Never add hooks that trigger extra redraws or change redraw scheduling (§2.3).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
- 2026-07-15 claude-opus: Built the spike as a private workspace package at `tests/fixtures/spikes/lifecycle-hook-composition/`. Composition strategy (ADR-105): wrap on the **component definition** at the transform's definition site — the same boundary ADR-103/104 use for `view` — never on `vnode.attrs` or at runtime. `createLifecycleRegistry().instrumentComponent(sourceId, component)` returns a *fresh* component object (original untouched) with `view` + all six hooks wrapped. Each wrapper delegates to the captured application hook via `app.hook.call(this, ...args)`; since Mithril dispatches component hooks as `callHook.call(vnode.state.hook, …)` with `this === vnode.state` and a POJO's `vnode.state = Object.create(definition)`, the inherited wrapper runs with `this === vnode.state` and forwards that same `this`, the exact args (`(vnode)`, or `(vnode, old)` for `onbeforeupdate`) and the return value. `onbeforeupdate`/`onbeforeremove` are pure pass-throughs (return app value, else `undefined`) so the inspector can never veto an update or stall a removal (§2.3); `onremove` cleans the strong `Map<id, record>` + captured nodes in a `finally` (so cleanup survives an app throw and the exception still propagates), while a `WeakMap<state, record>` lingers for stale-selection UX (§8.8). App attrs hooks compose for free because Mithril calls state- and attrs-hooks independently (state first). Confirmed Mithril 2.3.8 dispatch by reading `render.js` (`callHook`/`checkState`, `initComponent`/`initLifecycle` lines 153-154, `shouldNotUpdate` 852-877, `removeNode`/`tryBlockRemove`/`onremove` 604-634). Verified with 11 TDD'd tests in `src/lifecycle.test.ts` (`vitest run`, real `m.render` under jsdom): every hook receives `this === state` and the current vnode (incl. `onbeforeupdate`'s `(new, old)`); `onbeforeupdate` returning `false` passes through and skips the diff; an async `onbeforeremove` delays detachment while the mapping is retained, then `onremove` cleans it and the app onremove runs exactly once; an app-hook exception surfaces by object identity; cleanup runs even when app `onremove` throws (and rethrows); definition + attrs hooks fire in Mithril's order with cleanup alongside; a hook-less component and a fragment-root component are both captured (full DomRange) and cleaned on removal; `vnode.state`/attrs gain no inspector own-properties; multiple live instances of one component get distinct ids and independent cleanup; the view runs exactly once per pass (no extra redraw). Package typecheck clean (`tsc -p tsconfig.json`); full workspace `pnpm -r typecheck` and `pnpm -r test` green (all sibling packages/spikes unaffected: 5 spikes + 9 packages). ADR written at `docs/adr/ADR-105-lifecycle-hook-composition.md`; ADR-103 and ADR-104 cross-referenced (their deferred §7.7 removal-cleanup is now resolved here). Known limitations (see ADR): the spike covers POJO components — closure/class forms are the transform's job (task 0009) and the runtime batches association per render pass rather than per hook (task 0010); verified on Mithril 2.3.8 only.
