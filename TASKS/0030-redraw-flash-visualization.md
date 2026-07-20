# 0030 Redraw-flash visualization

Status: done
Priority: low
Owner: unassigned
Agent: claude
Area: diagnostics
Depends on: 0022, 0029

## Context

Split off from `TASKS/0026`'s Phase 5 "advanced diagnostics" list
(REQUIREMENTS.md §21) — the last unscoped visual item, after 0029 shipped
render-duration tracking and slow-render warnings. User asked (during 0029)
whether this is even reliable in Mithril, given every component's `view()`
runs on every `m.redraw()` regardless of whether anything actually changed.
Discussed and worth restating here so a fresh session doesn't have to
re-derive it:

- **"Did the DOM actually change" is still a well-defined, real signal** —
  it's just not decided by whether `view()` ran. Mithril's own diff (inside
  `m.render`) compares the new vnode tree against the old one attribute-by-
  attribute and child-by-child, and only touches real DOM nodes/attributes/
  text where something actually differs. A component whose `view()` returns
  structurally-identical output redraws (the function runs) but never
  mutates its DOM (the diff is a no-op) — that distinction is exactly what a
  flash indicator should key off, and it exists independently of whatever
  the component's internal (closure or object) state bookkeeping looks like.
- **A parent/child's `view()` calls never nest** (confirmed empirically in
  task 0029, see `components.test.ts`'s isolation test): Mithril calls a
  component's `view()`, gets its returned vnode tree back, and only
  *afterward* — while walking that returned tree during the same render pass
  — calls a child component vnode's own `view()`. The same non-nesting
  applies to the DOM mutations Mithril's diff performs while walking that
  tree, which is why per-component attribution below is tractable at all:
  each component's own top-level DOM range's mutations are a coherent,
  boundable unit, not smeared across an arbitrary call stack.

**This task is a design/investigation task, not a fully specified
implementation** — unlike 0029 (which had a clear, already-instrumented
mechanism to extend), the detection mechanism here is a genuinely open
choice between two candidates with different tradeoffs (below), and neither
has been prototyped against this codebase yet. Whoever picks this up should
expect to spend real time on the "Investigation" step before writing
production code — and per `CLAUDE.md`'s own convention ("Technical spikes
are private workspace packages under `tests/fixtures/spikes/`; record each
spike's outcome as an ADR in `docs/adr/`"), if the investigation turns up
real correctness or performance risk, escalate to a proper spike + ADR
(mirroring `ADR-101`/`ADR-105`) rather than debugging a real implementation
live — that pattern has already paid off twice in this project's history
(Phase 0's six spikes).

## Two candidate detection mechanisms — investigate before committing

1. **`MutationObserver`, scoped and batched.** Attach one `MutationObserver`
   per known mount subtree (`childList`/`attributes`/`characterData`,
   `subtree: true`), collect its records, and — once per redraw, rAF-
   throttled — map each mutated node back to its owning component via the
   already-existing `resolveDomComponent(node)`
   (`packages/runtime/src/components.ts`, exposed on `InspectorRuntime` in
   `runtime.ts`) and the DOM-association registry
   (`packages/runtime/src/dom-association.ts`). This is the natural fit for
   "did the DOM actually mutate" (it's literally what the API is for), but
   two things need to be worked out, not assumed:
   - **`ADR-101` already rejected "MutationObserver / DOM scanning"** — but
     for a *different* mechanism (unconditional, every-redraw source
     *tagging*, where a full-page scan would blow the §17 budget on every
     single redraw regardless of mode). This task's use is opt-in
     (`mode: "full"` + a dedicated toggle, off by default per 0026's own
     acceptance criteria) and observes only real mutations (the browser
     reports records, not a scan you write yourself) — the ADR-101 rejection
     likely doesn't transfer directly, but *re-read `ADR-101`'s "Rejected
     alternatives" and "Limitations" sections and confirm this explicitly*
     rather than assuming it's fine.
   - **The runtime does not currently track actual DOM mount-root elements.**
     `components.ts`'s `roots` (a `Set<InstanceRecord>`) is *component-tree*
     roots (`parentId === null`), not the DOM element(s) passed to
     `m.mount()`/`m.render()` — there is no existing "here are the live
     `m.mount` roots" registry to attach observers to. The playground itself
     mounts two independent roots (`apps/playground-vite/src/main.ts`:
     `m.mount(root, App)` and a separate `m.mount(statusRoot, StatusWidget)`
     for a status widget) — any solution needs to discover roots dynamically
     (e.g., the first DOM node any tagged/associated vnode produces) and
     handle roots appearing/disappearing at runtime, not assume exactly one
     fixed root element.
2. **Reuse the `domRange` the runtime already recomputes every flush.**
   `components.ts`'s `visitForOwnership`/`toRecord` already compute each
   instance's current `domRange` (`domRangeOf`), and `ComponentPatch`
   already includes `domRange` in a `components-updated` patch *when it
   changed* (node identity/count changed — see the `domRangeEqual` check in
   `flush()`). This is effectively free (no new instrumentation, no new
   browser API), but it only catches **node replacement** — a component
   whose top-level element identity changes. It does **not** catch the far
   more common case of an *existing* node's attributes or text content being
   patched in place (e.g., a class toggle, a text update) with no node
   replacement, which is likely the dominant case a flash indicator needs to
   be useful for. Probably insufficient alone, but cheap enough to prototype
   first as a baseline / fallback, and worth ruling in or out explicitly
   rather than skipping straight to (1).

A hybrid (domRange-diff as a fast pre-filter, `MutationObserver` only for
the finer-grained "did this unchanged-identity node's content actually
mutate" question) is also worth considering once (1) and (2) are each
understood on their own.

## Acceptance Criteria

- Investigation recorded first (this file, or a promoted spike + ADR if
  warranted per the Context section): which mechanism was chosen and why,
  with its actual measured behavior against a real redraw (not just reasoned
  about) — mirrors how 0026 itself asked for "scope decision recorded first"
  and how `ADR-101`/`ADR-105` record verified-against-real-Mithril behavior,
  not just design intent.
- Opt-in and **off by default** (§17, task 0026's own acceptance criterion)
  — a dedicated toggle, gated at minimum by `mode: "full"` (consistent with
  0029's diagnostics gating and REQUIREMENTS.md §17's own `full` definition).
  Given this is a visual/UI feature rather than protocol data, the toggle
  likely belongs in `OverlayOptions` (`packages/overlay/src/options.ts`)
  rather than `RuntimeOptions` — but confirm detection doesn't *also* need a
  runtime-side opt-in (e.g. to avoid installing a `MutationObserver` at all
  when the overlay feature is off), since that's where the real perf cost
  would live if mechanism (1) is chosen.
- rAF-throttled (§17 "pointer inspection updates capped at one per animation
  frame" — reuse the existing `createFrameScheduler`/`RafHost` abstraction in
  `packages/overlay/src/highlight.ts` rather than hand-rolling a new
  throttle), no full-page DOM scans on ordinary redraws, near-zero idle CPU
  when off or when nothing is redrawing.
- Correctly handles multiple independent mount roots (see playground example
  above) and roots/components that mount or unmount after the feature is
  already active.
- **Never flashes on the overlay's own DOM mutations** — the picker's
  highlight rectangles, hover badge, and docked panel all mutate DOM inside
  the overlay's own shadow root on essentially every frame while active; the
  existing `excludeHost`/`isUnderExcludedHost` mechanism
  (`packages/runtime/src/runtime.ts`) already solves exactly this class of
  problem for `resolveDomComponent`/DOM-association — reuse it rather than
  inventing a second exclusion path.
- Visual: a brief highlight (color + fade) over the DOM range
  (`rectsOfDomRange` in `packages/overlay/src/highlight.ts`) of each
  component whose own DOM actually mutated this redraw — not every
  component whose `view()` merely ran. Respects `prefers-reduced-motion`
  (§18) — follow the existing pattern (`controller.ts`'s reduced-motion
  `matchMedia` check used for "Scroll into view", and the `@media
  (prefers-reduced-motion: reduce)` block already in `styles.ts`) rather than
  adding a second one.
- Deliberately decoupled from task 0029's `renderDuration`/`slowRenderCount`
  — those measure `view()` function time, this measures DOM-mutation
  presence; don't conflate "slow" and "flashed" unless a later task
  explicitly wants to correlate them.
- Unit tests for the detection/attribution logic. A browser-test scenario in
  the existing Puppeteer suite (`tests/browser`, real Chromium — note that
  jsdom's `MutationObserver` support may not exactly match real-browser
  timing/coalescing behavior, so don't trust jsdom-only tests for the timing-
  sensitive parts if mechanism (1) is chosen).

## Non-goals

- No attrs/state editing, no time-travel (REQUIREMENTS.md §3.3 — standard
  project-wide non-goal, restated for completeness).
- Not a profiler: this is a boolean-ish "did it mutate" signal, not a
  quantified diff size/cost. (Task 0029 already covers timing.)
- No persistence of flash history — purely a live, transient visual, unlike
  the State History tab's (task 0027) recorded timeline.

## Implementation Notes (pointers for whoever picks this up)

- `docs/adr/ADR-101-vnode-dom-association.md` — read in full before starting;
  its "Rejected alternatives" and "Limitations and follow-ups" sections are
  directly relevant to whether `MutationObserver` is safe to introduce here.
- `packages/runtime/src/components.ts` — `resolveDomComponent`,
  `visitForOwnership`, `domRangeOf`/`domRangeEqual`, the `roots` set (component-
  tree roots, not DOM mount roots — see Context above).
- `packages/runtime/src/dom-association.ts` — the existing node→source
  association registry; understand its generation-counter/WeakMap pattern
  before adding a second, parallel tracking structure.
- `packages/runtime/src/runtime.ts` — `excludeHost`/`isUnderExcludedHost`
  (overlay self-exclusion), `RuntimeOptions` (where a new opt-in flag would
  likely live if detection needs a runtime-side toggle).
- `packages/overlay/src/highlight.ts` — `rectOfElement`, `rectsOfDomRange`,
  `boundingRect`, and the existing `createFrameScheduler`/`RafHost` rAF-
  throttling primitive (already used for hover tracking) — reuse, don't
  reimplement.
- `packages/overlay/src/controller.ts` — the reduced-motion `matchMedia`
  check (search "reduced-motion"); `packages/overlay/src/styles.ts` — the
  existing `@media (prefers-reduced-motion: reduce)` block.
- `TASKS/0029-render-timing-slow-warnings.md` — the immediately-preceding
  diagnostics task; mirror its scope discipline (investigate, decide, record
  why, implement narrowly) and its TDD-across-`protocol`→`runtime`→`overlay`
  structure if the chosen mechanism needs new protocol/runtime surface.

## Agent Notes

- 2026-07-20 claude: task created, split off `TASKS/0026`, after user asked
  (during 0029's implementation) whether redraw-flash is reliable in
  Mithril given `view()` always runs on every redraw. No implementation
  started — see Context for the discussion and the open mechanism choice.

- 2026-07-20 claude: **Investigation complete — mechanism (1)
  `MutationObserver` chosen over (2) domRange-diff.** Read every file this
  task's Implementation Notes point at (`ADR-101`, `components.ts`,
  `dom-association.ts`, `dom-range.ts`, `runtime.ts`, `highlight.ts`,
  `controller.ts`, `overlay.ts`, `styles.ts`) before deciding, plus tasks
  0022/0026/0029 for prior style/scope precedent. Findings:

  - **Mechanism (2) ruled out first, concretely, not just per the task's own
    prediction.** `dom-range.ts`'s `domRangeOf()` reads only `vnode.dom`/
    `vnode.domSize` — pure node-identity/count, assigned by Mithril only when
    a node is created or replaced. `Counter.ts`'s own fixture
    (`tests/browser/fixtures/app/src/Counter.ts`) is the concrete
    counterexample: clicking increments `count` and Mithril patches
    `span#counter-value`'s *text content* in place — `Counter`'s own
    `domRange` (`{first: div.counter, last: div.counter}`) never changes
    across that redraw, so a domRange-diff-only signal would never flash the
    single most common kind of redraw a user would want to see flash.
    Confirmed insufficient, not assumed.
  - **`ADR-101`'s "MutationObserver / DOM scanning" rejection re-read in full
    and confirmed it does not transfer.** That rejection targeted a
    *different* mechanism — full-page DOM scanning as the primary *tagging*
    signal, which would run unconditionally on every redraw regardless of
    mode and cannot recover a source expression (`ADR-101`'s own listed
    reason). This task's use is opt-in (`mode: "full"` + a dedicated,
    off-by-default toggle), observes only real browser-reported mutation
    records (never a scan), and only needs to resolve an already-tracked
    component id (`resolveDomComponent`), not recover a source expression.
    The two use cases don't share a failure mode.
  - **A working precedent for the exact "observe `document.body`,
    `subtree: true`" pattern already exists in this codebase, for a
    different purpose** — `overlay.ts`'s pre-existing `domObserver` (stale
    frozen-highlight cleanup on SPA route swaps) and `modalObserver` (native
    `<dialog>` detection), both scoped to `doc.body`/`doc.documentElement`
    rather than to any specific "mount root." This resolves the Context
    section's open question ("the runtime does not currently track actual
    DOM mount-root elements") by making it moot: observing a single stable
    ancestor (`document.body`) that is guaranteed to contain every mount
    root, rather than the roots themselves, needs no root registry, no
    discovery logic, and no special-casing for roots that mount/unmount
    later — multiple independent roots (verified against the existing
    `SecondRoot.ts`/`main.ts` two-root fixture) and later-appearing roots are
    handled for free.
  - **The same precedent already establishes, and this task's own browser
    test re-confirms, that a light-DOM observer never sees the overlay's own
    shadow-rooted mutations** (`overlay.ts`'s existing comment: "shadow
    boundaries are opaque to a light-DOM `MutationObserver`") — first line of
    defense against self-flashing, verified real behavior rather than
    assumed. `resolveDomComponent` (which already threads through
    `excludeHost`/`isUnderExcludedHost` in `runtime.ts`) is reused unchanged
    as the second line, covering the one light-DOM node that does still
    exist outside the shadow root: the shadow host element itself.
  - **No runtime-side opt-in needed.** `OverlayHook.getMode()` is read-only
    from the overlay's side (no `setMode` is reachable from the overlay UI —
    confirmed by grep), so mode is effectively fixed for the page's session.
    The overlay alone decides whether to construct the `MutationObserver` at
    all (`resolved.redrawFlash.enabled && hook.getMode() === "full"`,
    checked once at mount) — zero new runtime or protocol surface.
  - **Attribution edge case found and handled, not glossed over**: when a
    component's own top-level DOM node is replaced wholesale (its `view()`
    returns a different root tag on some redraw), the resulting `childList`
    mutation's `target` is that component's *parent* node, not the
    component's own (now-detached) old node — resolving only on `target`
    would misattribute the flash to the parent's owning component. Fix:
    resolve each mutation's `addedNodes` as well as its `target` and union
    the results (`redraw-flash.ts`'s `componentsWithMutatedDom`) — the added
    node is the component's new own top-level node once Mithril's diff has
    inserted it. A dedicated test proves this (asserts the child, not the
    parent, flashes on a root-tag-swapping redraw).
  - **No spike + ADR promotion.** Per this task's own Context section, that
    escalation path is for when investigation "turns up real correctness or
    performance risk." Nothing here rises to that bar: the DOM-observation
    approach itself is already proven in this exact codebase (not a novel
    mechanism, unlike Phase 0's six spikes validating vnode-DOM association
    from nothing); the one real edge case found (`addedNodes` attribution,
    above) is a small, directly-testable fix, not an open unknown. Recording
    the decision here, per this file's own "this file, or a promoted spike"
    option.
  - Implementation follows in this same session; see the dated entries below
    for what shipped, what was verified against real Mithril/real Chromium,
    and any residual known limitations.

- 2026-07-20 claude: Implemented and verified end-to-end via TDD, entirely
  within `packages/overlay` — no new protocol or runtime surface was needed
  (see the investigation above: mode is already exposed via
  `hook.getMode()`, and `resolveDomComponent` already threads through
  `excludeHost`).

  - **`packages/overlay/src/redraw-flash.ts` (new)**: pure attribution logic,
    decoupled from `MutationRecord` (which has no public constructor and
    can't be built in tests) via a structural `DomMutationLike { target,
    addedNodes }` interface, mirroring this file's existing `ClickEvent`-style
    testable interfaces. `componentsWithMutatedDom(records,
    resolveDomComponent)` resolves each record's `target` (the common case —
    content added/removed/patched within a stable container) *and* each
    `addedNodes` entry (catches a component's own root node being replaced
    wholesale, where the mutation's `target` is the component's *parent*, not
    itself), unioning both — a component's own container and a freshly
    swapped-in child can both legitimately be "actually mutated" in the same
    batch. 7 tests in `redraw-flash.test.ts`, including a multi-root
    interleaved-records test (this repo's own multi-group TDD guidance) and a
    dedicated test proving the `addedNodes` fix matters (asserts the replaced
    child — not just the parent — is attributed).
  - **`packages/overlay/src/options.ts`**: `RedrawFlashOptions { enabled }`,
    `DEFAULT_REDRAW_FLASH_OPTIONS` (`{enabled: false}` — off by default at the
    *package* level too, unlike `componentTree`'s permissive default, per
    task 0026's own "opt-in" acceptance criterion), wired into `OverlayOptions`/
    `resolveOverlayOptions`. 2 new tests in `options.test.ts`.
  - **`packages/overlay/src/controller.ts`**: `FlashEntry { componentId, seq,
    rects }` and a `flashes: readonly FlashEntry[]` field on
    `OverlayViewState`; `recordDomMutations(records)` — gated on
    `options.redrawFlash.enabled && hook.getMode() === "full"` (checked
    inside the controller too, not only by whether `overlay.ts` installed the
    observer, matching this file's existing defense-in-depth style) — resolves
    via `componentsWithMutatedDom`, looks up each id's *current* `domRange`
    (`hook.componentRecord(id)`) and computes rects via the existing
    `rectsOfDomRange`, and arms a `setTimeout` per component (400ms,
    `REDRAW_FLASH_DURATION_MS`) that self-removes the entry and redraws —
    mirrors the existing picking-banner auto-hide `setTimeout` idiom already
    in this file rather than inventing a new one. Refreshing an
    already-flashing component clears its old timer and bumps a monotonic
    `nextFlashSeq` (not just per-component — per *occurrence*) so the view can
    key each flash's DOM node on `componentId:seq`, forcing Mithril to insert
    a fresh element rather than diff-reuse the old one — necessary because a
    CSS animation with `animation-fill-mode: forwards` does not replay on an
    element Mithril patches in place after it already reached its end state,
    only on a freshly-inserted one. All timers cleared in `dispose()`. 9 new
    tests in `controller.test.ts` (`vi.useFakeTimers()` for the expiry/refresh
    cases), including a mode-gating test and a "skips a resolved component
    with no current DOM range" test (an already-unmounted component).
  - **`packages/overlay/src/view.ts`**: `highlightLayer()` renders one
    `div.mi-rect.mi-flash-rect` per flash rect, keyed
    `componentId:seq:index`.
  - **`packages/overlay/src/styles.ts`**: `--mi-flash`/`--mi-flash-fill`
    theme variables (light/dark, both dark blocks), `.mi-flash-rect` +
    `@keyframes mi-flash-fade` (400ms opacity fade). No new
    `prefers-reduced-motion` check — the existing global `.mi-root *` rule
    already zeroes every animation, and removal is timer-driven regardless of
    whether the animation plays, so reduced-motion users still get a brief,
    static (non-animated) flash rather than nothing, per the acceptance
    criterion's own instruction to reuse the existing pattern.
  - **`packages/overlay/src/overlay.ts`**: a `MutationObserver` on `doc.body`
    (`childList`/`attributes`/`characterData`, `subtree: true`), installed
    only when `resolved.redrawFlash.enabled && hook.getMode() === "full"`
    (decided once at mount — the overlay has no live mode setter to react
    to). Buffers records and requests a frame via the existing
    `createFrameScheduler`, mirroring `moveScheduler`/`refreshScheduler`
    exactly; the frame drains the buffer into
    `controller.recordDomMutations()` once. Disconnected + scheduler
    cancelled in `dispose()`, mirroring the existing `domObserver`/
    `modalObserver` cleanup already there. 5 new tests in `overlay.test.ts`:
    a real attribute-mutation flash, off-by-default, off when mode isn't
    full, a "never flashes on the overlay's own shadow DOM" test (with a
    deliberately *permissive* fake `resolveDomComponent` that resolves every
    node, so an observed flash would prove a real leak rather than a
    resolution artifact — passed clean, confirming shadow-DOM opacity holds
    in jsdom too, not just reasoned about), and a dispose-disconnects test.
  - **`packages/overlay/src/index.ts`**: exported `RedrawFlashOptions`,
    `DEFAULT_REDRAW_FLASH_OPTIONS`, `FlashEntry`, `componentsWithMutatedDom`,
    `DomMutationLike` — matching every other pure/public building block.
  - **`packages/adapter-kit/src/options.ts`**: `MithrilInspectorOptions.
    redrawFlash?.enabled`, `ResolvedRedrawFlashOptions`, defaulted to `false`
    unconditionally (unlike `componentTree`'s `mode === "full"`-based
    defaulting — task 0026's own criterion requires this specific feature to
    stay opt-in even in `full` mode), mapped through `toOverlayOptionsInput`.
    Re-exported from `packages/adapter-kit/src/index.ts`. This automatically
    reaches all four bundler adapters (vite/rollup/esbuild/webpack), which
    each just re-export the shared `MithrilInspectorOptions` type rather than
    redeclaring it — confirmed by re-typechecking all four after the change,
    no adapter-specific code needed. 5 new tests in
    `packages/adapter-kit/src/options.test.ts`.
  - **`tests/browser/src/redraw-flash.test.ts` (new)**: real Chromium, not
    jsdom, per this task's own investigation note about not trusting jsdom
    for `MutationObserver` timing. 3 tests against the existing playground
    fixture (no fixture changes needed): (1) clicking `Counter`'s
    `#counter-btn` — a pure text-content patch with **no DOM-node
    replacement**, i.e. exactly the case `domRangeOf`-only detection
    (candidate mechanism 2) would have missed — produces a flash that clears
    itself; (2) a mutation on the second, independent `m.mount` root
    (`#second-root`, `SecondRoot.ts`) is correctly attributed, confirming the
    single-`document.body`-observer design handles multiple mount roots with
    zero root-registry code; (3) heavy picker/hover activity produces zero
    flashes, confirming self-exclusion holds in a real browser too.

  **Acceptance criteria — literal check**: investigation recorded first ✔
  (Agent Notes above, with concrete measured behavior — the `Counter` text-
  patch case and the shadow-DOM-opacity confirmation — not just reasoning);
  opt-in + off by default, `mode: "full"` gate ✔ (three places: adapter-kit
  resolver, `OverlayOptions` package default, and `controller.ts`'s own
  runtime check); no runtime-side opt-in needed, confirmed explicitly rather
  than assumed ✔; rAF-throttled via the existing `createFrameScheduler` ✔; no
  full-page DOM scans (`MutationObserver` is push-based, never a scan) ✔;
  multiple independent mount roots + roots mounting/unmounting later ✔ (by
  construction — no root registry exists to go stale); never flashes on the
  overlay's own DOM, reusing `excludeHost`/`resolveDomComponent` with no
  second exclusion path ✔; visual highlight with color+fade, respecting
  `prefers-reduced-motion` via the existing global rule ✔; decoupled from
  task 0029's `renderDuration`/`slowRenderCount` (no shared fields, no shared
  code path) ✔; unit tests for detection/attribution + a real-Chromium
  browser scenario ✔.

  **Verified** (each count attributed to this task, re-run standalone before
  quoting):
  - `packages/overlay`: 23 new tests across 4 files —
    `src/redraw-flash.test.ts` new (7), `src/options.test.ts` +2 (11 total),
    `src/controller.test.ts` +9 (89 total), `src/overlay.test.ts` +5 (52
    total) — each re-run standalone via `vitest run src/<file>.test.ts` and
    green. Full package: `vitest run` → 319 passed, 18 files. `tsc -p
    tsconfig.json --noEmit` clean; `tsc -p tsconfig.json` (declaration build)
    clean.
  - `packages/adapter-kit`: 5 new tests in `src/options.test.ts` (23 total,
    up from 18), via `vitest run src/options.test.ts` → 23 passed. Full
    package: `vitest run` → 41 passed, 4 files. `tsc -p tsconfig.json
    --noEmit` clean.
  - `packages/vite`/`rollup`/`esbuild`/`webpack`: no code changes needed
    (each re-exports adapter-kit's `MithrilInspectorOptions` type
    unchanged); re-typechecked all four after the adapter-kit change —
    clean.
  - `tests/browser`: new `src/redraw-flash.test.ts`, 3 passed, verified
    standalone twice in a row plus as part of the full 12-file suite (30
    passed, up from 27, same 12 files minus this new one). Real Chromium via
    Puppeteer, not jsdom.
  - Whole workspace (including the substantial *pre-existing* uncommitted
    work already in this tree before this task started — see below):
    `pnpm -r build` (20 projects), `pnpm -r typecheck` (20 projects), and
    `pnpm -r test` all green, no regressions anywhere.

  **Known limitations, honestly scoped**:
  - Attribution can occasionally flash two components for one logical
    change (a container *and* a child whose own root node was replaced
    inside it) rather than picking a single "most specific" owner — see
    `redraw-flash.ts`'s own doc comment. Deliberate: inventing a
    suppression rule beyond what `resolveDomComponent` already does
    everywhere else in this codebase felt like new, unproven semantics for a
    low-priority visual feature; documented rather than engineered around.
  - `FLASH_DURATION_MS` (400ms) is a fixed constant, not configurable —
    nothing in the acceptance criteria asked for a tunable duration, so no
    settings-tab/option surface was added for it (mirrors how task 0029 left
    `slowRenderThresholdMs` unconfigurable from the UI).
  - A flash captured just before a `resetTracking()`/HMR full-invalidation
    keeps showing its last-known rects for the remainder of its ≤400ms
    window even though the runtime's own tracking already reset — a self-
    clearing timeout was judged sufficient hygiene given how transient this
    feature already is (§ Non-goals: "no persistence of flash history"); not
    wired into the `reset` event.

- 2026-07-20 claude: **Flagging before committing, not deciding
  unilaterally**: this working tree already contained a large amount of
  unrelated, uncommitted work *before this task started* (confirmed via the
  session's initial git status) — apparently task 0029's own implementation
  (`TASKS/0029` itself was untracked-new, with a complete "done" Agent Notes
  entry already in it) plus other changes touching `packages/protocol`,
  `packages/runtime` (`components`, `runtime`, `serializer`),
  `packages/server` (`editors`, `handle-request`), several READMEs, and
  `apps/playground-vite/vite.config.ts`. Some of it lands in files this task
  also needed to touch (`packages/overlay/src/controller.ts`, `styles.ts`,
  `view.ts`, `options.ts`; `packages/adapter-kit/src/options.ts`,
  `options.test.ts`, `index.ts`), so a plain `git add <file>` would stage
  both bodies of work together — not "exactly the files this task touched."
  Per this task's own commit instructions, not committing until the user
  says how to handle this rather than guessing.
