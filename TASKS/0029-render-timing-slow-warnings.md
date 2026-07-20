# 0029 Render-duration tracking and slow-render warnings

Status: done
Priority: low
Owner: unassigned
Agent: claude
Area: diagnostics
Depends on: 0022

## Context

User request: pick up part of task 0026's Phase 5 "advanced diagnostics" list
(REQUIREMENTS.md §21) — specifically "update count" and "slow-component
warnings". Investigated before starting:

- **Update count was already shipped.** `ComponentRecord.updateCount` (task
  0017) and its `×N` tree-row badge (`updateCountBadge` in `view.ts`, §3.2)
  predate this task entirely — nothing to add there. This task is scoped down
  to just the new half: **render timing + slow-render warnings**.
- Per REQUIREMENTS.md §17, render timing/diagnostics is explicitly a
  `mode: "full"`-only concern (`full`: "Element source mapping, hierarchy,
  attrs, state **and diagnostics**"), so measurement is gated the same way
  attrs/state capture already is — no new mode needed, and the feature costs
  nothing in the cheaper `"source"`/`"components"` modes.
- Considered whether "slow" should be a runtime-side or overlay-side policy.
  Chose runtime-side (`RuntimeOptions.slowRenderThresholdMs`, default 16ms —
  one 60fps frame budget) rather than a UI-configurable Settings-tab
  threshold: it lets `slowRenderCount` be a simple persistent counter
  (mirroring `updateCount`'s own existing pattern) instead of the overlay
  recomputing "is slow" from a raw duration on every redraw. A live
  Settings-tab override is a straightforward follow-up if wanted later —
  deferred rather than speculatively built now.
- Did **not** touch `adapter-kit` or any bundler adapter (vite/rollup/esbuild/
  webpack): `slowRenderThresholdMs`/`perfNow` are `RuntimeOptions` fields,
  already passed through generically by the adapters' existing `__miConfig`
  bootstrap, but exposing a dedicated adapter-level config surface for the
  threshold was out of scope for this pass (no adapter currently whitelists
  it either — see Limitations below).

## Acceptance Criteria

- `ComponentRecord.renderDuration: number | null` (protocol) — the most
  recent `view()`/route-resolver `render()` call's own wall-clock duration in
  ms; `null` until measured.
- `ComponentRecord.slowRenderCount: number` — cumulative count of renders
  whose `renderDuration` exceeded the threshold.
- Both included on `ComponentPatch` and always present on a
  `components-updated` patch (mirrors `updateCount`/`updatedAt`).
- Measured only in `mode: "full"` — zero `performance.now()` calls in
  `"source"`/`"components"` mode (§17 "opt-in, off by default").
- The measurement isolates each component's own render cost from its
  descendants' — a slow child must never inflate an ancestor's number.
- Tree row: a `⚠ N` badge, hidden until `slowRenderCount > 0`, tooltip shows
  the count and latest duration.
- Detail pane: a "Last render: Xms [· N slow render(s)]" line for the
  selected component, styled as a warning once slow, hidden entirely until a
  render has actually been measured.
- Unit tests (runtime + overlay) and no regressions in the existing suite
  (protocol/runtime/overlay unit tests, integration tests, browser suite).

## Implementation Notes

- `packages/runtime/src/components.ts`: timing brackets only
  `app.view.call`/`def.render.call` inside the existing `composeHooks.view`/
  `composeRouteResolver.render` wrappers (ADR-105's composition point) — not
  `recordOwnedVnodes` (inspector bookkeeping) and not the try/finally's
  `scopeStack.pop()`. This isolation from descendants isn't something the
  wrapper has to enforce itself — it falls out of Mithril's own render order:
  a component's `view()` returns its vnode tree, and only *afterward*, while
  walking that returned tree during the same render pass, does Mithril call a
  child component vnode's own `view()`. So the child's call happens strictly
  after the parent's call has already returned its stack frame, never nested
  inside it.
- `RuntimeOptions.perfNow` (default `performance.now`) mirrors the existing
  `RuntimeOptions.now` injection pattern for tests.
- `slowRenderCount`/`renderDuration` reset to `0`/`null` for any newly
  allocated `InstanceRecord` (mount, or reallocation after a `reset()` epoch
  bump) — same lifecycle `updateCount` already has, no special-casing needed.
- Threaded from `AncestryEntry` (`controller.ts`) rather than adding a new
  gating field or hook method — `renderDuration`/`slowRenderCount` are plain
  per-record data, same treatment as the existing `key`/`mounted` fields
  there.

## Agent Notes

- 2026-07-20 claude: Implemented and verified end-to-end, TDD throughout
  (protocol → runtime → overlay).
  - `packages/protocol/src/index.ts`: added the two fields to
    `ComponentRecord`/`ComponentPatch`.
  - `packages/runtime/src/components.ts`: `InstanceRecord` gained
    `renderDuration`/`slowRenderCount`; `recordRenderDuration()` helper bumps
    the count past `slowRenderThresholdMs` (default 16); wired into both the
    object/closure `view()` wrapper and the route-resolver `render()`
    wrapper, gated on `getMode() === "full"`. 8 new tests in
    `components.test.ts` (72 total in that file), including one that
    empirically proves the parent/child isolation claim against real Mithril
    rendering (a fake `perfNow` sequence where the child's own pair of calls
    would corrupt the parent's duration if the bracketing were wrong) rather
    than just asserting it.
  - `packages/runtime/src/runtime.ts`: `RuntimeOptions.perfNow`/
    `slowRenderThresholdMs` passthrough to `createComponentRegistry`.
  - `packages/overlay/src/controller.ts`: `AncestryEntry` gained the two
    fields, populated from each ancestry record in `getState()`.
  - `packages/overlay/src/view.ts`: `slowRenderBadge()` next to the existing
    `updateCountBadge()` in the tree row; `renderTimingInfo()` in the detail
    pane, reading the selection's own ancestry entry (`self`).
  - `packages/overlay/src/styles.ts`: `.mi-badge-warn` (mirrors
    `.mi-badge-count`, themed via `--mi-danger`), `.mi-render-timing`/
    `.mi-render-timing-slow`.
  - Test fixture fallout: every `ComponentRecord`/`ComponentPatch` literal
    across `runtime.test.ts`/`overlay.test.ts`/`controller.test.ts`/
    `tree.test.ts`'s helper factories needed the two new required fields
    (`renderDuration: null, slowRenderCount: 0`) — TypeScript caught every
    site; no runtime-only gaps.
  - Verification: `pnpm -r build` and `pnpm -r typecheck` clean across all 20
    workspace projects. `pnpm -r test`: runtime 197/197 (72 in
    `components.test.ts`), overlay 296/296 (47 in `overlay.test.ts`, 80 in
    `controller.test.ts`), full monorepo suite including `tests/integration`
    (16/16) and `tests/browser` (27/27, unchanged file count — no new browser
    scenario needed since the feature is fully covered at the unit/
    overlay-integration level, consistent with how task 0028 judged the same
    tradeoff).
  - Updated `packages/runtime/README.md` (new "Render-duration tracking and
    slow-render warnings" section, `mode: "full"` doc comment, the
    `components-updated` bullet, and the "Known Phase 1/2 limitations" entry
    that previously called `mode: "full"` pure scaffolding) and
    `packages/overlay/README.md` (Component tree bullet).

## Limitations and follow-ups

- `slowRenderThresholdMs` is not yet exposed through any bundler adapter's
  own options surface (`vite`/`rollup`/`esbuild`/`webpack` `InspectorOptions`)
  — only reachable via `RuntimeOptions` directly (programmatic/test use) or a
  manually-authored `__miConfig`. Wiring it through `adapter-kit`'s
  `resolveInspectorOptions` the same way `redact`/`mode` already are is a
  small, separate follow-up.
- No live Settings-tab override for the threshold (see Context above) — would
  need either a new `setSlowRenderThresholdMs`/`getSlowRenderThresholdMs`
  hook pair or moving the "is slow" decision to the overlay entirely.
- Only the single most-recent render's duration is kept (`renderDuration`),
  not a rolling history — a component that had one slow spike then several
  fast renders still shows `slowRenderCount > 0` (so the warning persists)
  but the detail pane's own duration line reflects only the latest number.
  Anyone wanting a time series already has the State History tab (task 0027)
  as a model to extend.
- Redraw-flash visualization, route inspection, and the optional Chrome
  DevTools extension bridge — the rest of REQUIREMENTS.md §21 Phase 5's
  "consider" list — remain unscoped; see `TASKS/0026`.
