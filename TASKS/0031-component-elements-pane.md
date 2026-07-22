# 0031 Component elements pane (DOM/vnode expansion, §9.1)

Status: done
Priority: medium
Owner: unassigned
Agent: claude
Area: overlay
Depends on: 0022

## Context

REQUIREMENTS.md §9.1 deliberately keeps the Components tab's tree a
*component* tree, not a DOM tree ("do not include ordinary HTML elements in
the default component tree"), but flags one explicit optional extension:

> Optionally allow expansion of a component into its owned vnode/element tree.

Discussed with the user against a real screenshot of a page whose component
tree is a single row (`Home`) even though the rendered page has many DOM
elements underneath — the tree correctly hides them per §9.1, but there's
currently no way to see what a component actually rendered short of opening
devtools' own Elements panel and losing the component-relative framing
entirely.

Design settled across two conversation turns, recorded here so implementation
doesn't have to re-derive it:

1. **A new sidebar tab, not inline per-row expansion inside the existing
   Components tree.** `tree.ts`'s row model (`ComponentTreeStore`) keys
   collapse state and search-match purely by `ComponentId`
   (`collapsedIds: Set<ComponentId>`, `computeSearchMatches` walking
   `record.parentId`) — splicing heterogeneous DOM-node rows into that same
   flat structure would mean reworking its id scheme and search logic for a
   feature §9.1 itself calls optional. A separate tab avoids touching that
   tested store at all.
2. **The new tab reuses the *same* left tree pane instance — only the right
   pane differs per tab.** This is not a new pattern: the History tab already
   works exactly this way. `view.ts`'s `dockedPanel` (`view.ts:1429-1440`)
   renders `m("div.mi-main", [treePane(controller, state),
   historyDetailPane(controller, state)])` for the History tab and
   `[treePane(controller, state), detailPane(controller, state)]` for
   Components — same `treePane(controller, state)` call both times.
   `historyDetailPane`'s own doc comment (`view.ts:1298`) even states the
   rationale: "mirrors `detailPane`'s role next to `treePane`, so the History
   tab reuses the same left tree the Components tab does rather than leaving
   'which component is this?' unclear." Selection itself
   (`OverlayViewState.selection`) is a single model owned by the controller
   (`controller.ts`'s `createSelectionModel` call, `selection.select(...)` at
   `controller.ts:944`), not duplicated per tab — so switching tabs already
   cannot lose the current selection today, and this new tab gets that for
   free by following the same `[treePane, <newPane>]` shape. No new
   "keep selection across tabs" mechanism needs to be built.
3. **Render nested nodes as mithril hyperscript shorthand**
   (`tag#id.class.class`, e.g. `div.scroll`, `span#counter-value`), not raw
   tag+attribute dumps — truer to §9.1's own "owned vnode/element tree"
   wording and matches how mithril developers already read selectors
   day-to-day.
4. **Tag-name visibility is a Settings-tab toggle**, not fixed: `div.scroll`
   vs `.scroll` (tag omitted, matching mithril's own selector shorthand where
   `div` is the implicit default). Default on (`div.scroll`, matching current
   behavior elsewhere in the panel); toggling off compacts every row to just
   `#id.class...`.
5. **DOM nodes owned by a nested child component become a link back into the
   Components tree, not more raw markup.** The selected component's own
   `record.childIds` are exactly its direct child components (per
   `tree.ts`'s comment: "Parent/child structure comes directly from each
   record's own `childIds`"). When the recursive DOM walk (below) reaches a
   node equal to some child record's own `domRange.first`, stop descending
   into it and render a clickable chip with that child's `displayName`
   instead — clicking it calls `controller.selectComponent(id)`
   (`controller.ts:312`, already used by tree rows today), which updates the
   shared selection and highlights/scrolls it, so drilling from "elements" to
   "components" is a single click using an existing action, not a new one.
   Plain DOM nodes with no such owner render as inert (non-link) rows.

## Acceptance Criteria

- New sidebar tab (working name: "Elements" — bikeshed the exact label/icon
  if a better fit turns up) added to `OverlayTab`
  (`controller.ts:50`, currently `"components" | "history" | "settings"`),
  a new `sidebarButton(...)` entry in `sidebar()` (`view.ts:1417-1419`) with
  a new icon in `icons.ts` (existing `iconCode`/`iconComponents`/`iconHistory`
  are already spoken for elsewhere — don't reuse them), and a new branch in
  `dockedPanel` (`view.ts:1429-1440`) rendering
  `[treePane(controller, state), elementsDetailPane(controller, state)]` —
  same left pane instance as the other two data tabs, per Context point 2.
- **`persistence.ts`'s `PersistedTab`/`PERSISTED_TABS`
  (`persistence.ts:13-17`) must be updated too** — it's a deliberately
  separate, non-imported mirror of `OverlayTab` (to avoid a circular import
  back into `controller.ts`) used to validate the last-active-tab read from
  `localStorage`. Forgetting this means the new tab id gets silently rejected
  on reload and the panel falls back to "components" — easy to miss since
  everything else would typecheck and work within a single session.
- When nothing is selected, the new pane shows the same empty-state framing
  `detailPane` already uses (`view.ts:840-857`) rather than inventing a
  different empty message.
- When a component is selected, the pane recursively renders its owned
  DOM/vnode tree starting from `nodesOfDomRange(record.domRange)`
  (`packages/overlay/src/highlight.ts:49`, already used for fragment
  highlighting) — that function only enumerates *top-level sibling* nodes of
  the range, so a genuinely new recursive descent into `node.childNodes` is
  needed for anything beneath the top level; it does not exist yet anywhere
  in the codebase.
  - Give the recursive walk its own depth **and** node-count cap, in the same
    spirit as `nodesOfDomRange`'s existing `10_000`-iteration guard
    (`highlight.ts:58`) against a malformed/cyclic range — a defensively
    large but finite subtree (e.g. a long unvirtualized list) must degrade to
    a truncated view with an indicator, never hang the panel or the browser
    tab.
  - Each element node renders as `tag#id.class.class` per Context point 3,
    respecting the Settings-tab tag-visibility toggle (point 4) — reuse
    `checkboxSettingRow` (`view.ts:933-950`, the same helper
    `bannerToggleRow`/the redraw-flash toggle already use) for that Settings
    row rather than hand-rolling a new checkbox pattern. Decide during
    implementation, and record the decision, how non-element nodes (text,
    comment) are represented — options include a short quoted text preview,
    a dimmed placeholder, or omitting them entirely; nothing in this task's
    discussion settled that.
  - A node matching a child component's `domRange.first` renders as a link
    per Context point 5 instead of being recursed into further — verify this
    against a real fragment-root child (a component whose `domRange` spans
    multiple top-level siblings, not just a single element) so the boundary
    check doesn't only work for the single-root-element common case.
- New/updated tests: `tree.test.ts`-adjacent or a new `elements-pane.test.ts`
  in `packages/overlay/src` for the recursive-walk + hyperscript-formatting +
  child-boundary-link logic (pure functions, testable without a real DOM
  where feasible — jsdom where an actual node tree is needed), plus
  `view.test.ts`/`controller.test.ts` coverage for the new tab wiring and the
  `persistence.ts` round-trip. A `tests/browser` scenario exercising a real
  page (e.g. the existing playground fixture) is worth adding given this
  feature walks real, non-jsdom-verified DOM structure end to end.

## Non-goals

- Not a live-editing tool — read-only, mirroring this project's standing
  "no attrs/state editing, no time-travel" non-goal (REQUIREMENTS.md §3.3).
- Not a full replacement for the browser's own Elements panel — no computed
  styles, no attribute editing, no box model; just enough structure (tag,
  id, classes, and component boundaries) to answer "what did this component
  actually render."
- No change to the default Components tree's own §9.1 behavior (still hides
  DOM elements by default) — this is purely an additional, opt-in-by-tab
  view alongside it.

## Implementation Notes

- `REQUIREMENTS.md:865-888` — §9.1, the spec section this task fulfills.
- `packages/overlay/src/view.ts:1298-1299` (`historyDetailPane` doc comment)
  and `view.ts:1429-1440` (`dockedPanel`) — the existing "same left tree,
  different right pane per tab" precedent to mirror exactly.
- `packages/overlay/src/tree.ts:15-59` — why inline expansion inside the
  existing store was rejected (Context point 1); read in full before
  considering revisiting that decision.
- `packages/overlay/src/highlight.ts:49-65` — `nodesOfDomRange`, the sibling
  walk to start from, and its existing cap pattern to mirror for the new
  recursive descent.
- `packages/overlay/src/controller.ts:312` — `selectComponent(id)`, the
  action the child-boundary links should call.
- `packages/overlay/src/persistence.ts:13-19` — the `OverlayTab` mirror that
  must be updated in lockstep (see Acceptance Criteria).
- `packages/overlay/src/view.ts:933-950` — `checkboxSettingRow`, for the new
  tag-visibility Settings toggle.
- `packages/protocol/src/index.ts:83-` (`ComponentRecord`) and `:153-156`
  (`DomRange`) — the data this feature reads; no protocol changes anticipated
  (`domRange` and `childIds` already exist), but confirm that during
  implementation rather than assuming.
- `packages/overlay/src/options.ts` — where a new `readonly showTagName:
  boolean`-shaped option would live (mirrors `RedrawFlashOptions`'s small,
  single-purpose options interface, `options.ts:81-84`); wire through
  `OverlayOptions`/`resolveOverlayOptions` and `adapter-kit`'s
  `MithrilInspectorOptions` the same way task 0030 did for `redrawFlash`
  (`TASKS/0030`'s Agent Notes has the full list of files that touched, useful
  as a checklist).

## Agent Notes

- 2026-07-22 claude: task created from a design discussion (screenshot of a
  single-row `Home` component tree prompting "what did this actually
  render?"). Five design decisions were reached and are recorded in Context
  above, verified against the real source (`tree.ts`, `view.ts`,
  `controller.ts`, `highlight.ts`, `persistence.ts`, `REQUIREMENTS.md`) rather
  than assumed — no implementation started yet.

- 2026-07-22 claude: **Implemented end-to-end via TDD.** New pure module
  `packages/overlay/src/elements.ts`: `buildChildBoundaries` (a
  `Node -> ChildBoundary` lookup from a component's direct `childIds`,
  skipping any with no resolvable `domRange.first`), `buildElementsTree`
  (starts from `nodesOfDomRange` — the existing sibling walk from
  `highlight.ts` — then recurses into `childNodes`, stopping at any node
  matching a `ChildBoundary` and skipping every sibling up to its own `last`
  rather than leaking the rest of a fragment-root child's range back out as
  plain DOM), and `formatElementLabel` (mithril hyperscript shorthand,
  `tag#id.class` / `#id.class` with `showTagName` off, falling back to the
  bare tag when there's nothing else to show so a label is never blank).
  Comment nodes are skipped entirely (not counted, not rendered); whitespace-
  only text nodes are omitted, meaningful ones truncated to 40 chars — a
  decision this task's own Acceptance Criteria left open, recorded here per
  its own instruction to. Walk limits (`maxNodes: 500`, `maxDepth: 40`) mirror
  `nodesOfDomRange`'s own defensive-cap instinct, degrading to a `truncated`
  flag rather than hanging on a huge or cyclic subtree.

  - `controller.ts`: `OverlayTab` gained `"elements"`; new
    `ElementsPaneViewState` computed in `getState()` from the selected
    component's own record + its children's records (guarded with `== null`/
    `?? []` rather than strict `null`/`undefined` checks, since several
    existing test fixtures across this file cast a partial object as
    `ComponentRecord` without `domRange`/`childIds` — confirmed by a real
    crash during the first test run, not assumed); new persisted/live
    `showElementTagName` setting mirroring `redrawFlashEnabled`'s own
    pattern, plus `setShowElementTagName`.
  - `options.ts` / `adapter-kit/src/options.ts`: new `elementsPane.showTagName`
    (default `true`) routed through the full chain
    (`OverlayOptions`/`resolveOverlayOptions` → `MithrilInspectorOptions` →
    `resolveInspectorOptions` → `toOverlayOptionsInput`), per this task's own
    Implementation Notes — unlike `redrawFlash`, not mode-gated, since it's a
    pure label-formatting preference. All four bundler adapters
    (vite/rollup/esbuild/webpack) re-export `MithrilInspectorOptions`
    unchanged — re-typechecked individually, no adapter-specific code needed
    (same finding task 0030 recorded for `redrawFlash`).
  - `persistence.ts`: `PersistedTab` extended to include `"elements"` (the
    Acceptance Criteria's own explicitly-flagged easy-to-miss step) and
    `showElementTagName` added to the persisted-state parser.
  - `view.ts`: `elementsView`/`elementsDetailPane`/`elementsPaneNodeRow` —
    mirrors `historyDetailPane`'s "same `treePane`, different right pane"
    shape exactly (`dockedPanel`'s existing ternary chain gained one more
    branch). Nesting renders as plain nested `<ul>`s (indentation via
    `.mi-elements-tree`'s own CSS `padding-left`), not a flattened
    `aria-level` list like the Components tree — no search/collapse/keyboard
    nav is needed for a read-only mirror of what got rendered. A child
    boundary renders as a `button.mi-preview-component-link` (the same class
    `previewNodeView`'s own "open in editor" component link already uses)
    calling `controller.selectComponent`. New Settings-tab row
    (`elementTagNameToggleRow`) reuses `checkboxSettingRow` unchanged.
  - `icons.ts`: new `iconElements` (nested-frame glyph) — distinct from
    `iconComponents`' branching-tree and `iconCode`'s already-spoken-for
    `</>`.
  - `styles.ts`: `.mi-elements`/`.mi-elements-tree`/`.mi-elements-tree-root`
    plus the scrollbar-theming selector lists extended to include
    `.mi-elements`.
  - `index.ts` (overlay): exported the new `elements.ts` building blocks and
    types, plus `ElementsPaneViewState`/`ElementsPaneOptions`, matching every
    other pure/public building block already exported.
  - `packages/overlay/README.md` / `packages/vite/README.md`: one new bullet
    each, matching the existing level of detail for State History/redraw-flash.

  **Acceptance criteria — literal check**: new sidebar tab wired into
  `OverlayTab`/`sidebar()`/`dockedPanel()`/a new icon ✔; `persistence.ts`'s
  `PersistedTab` mirror updated (the criterion's own explicit "easy to miss"
  warning) ✔; empty-state matches `detailPane`'s framing ✔; recursive walk
  from `nodesOfDomRange` with its own depth+count cap, degrading to a
  truncation notice ✔; `tag#id.class` labels respecting the Settings toggle,
  reusing `checkboxSettingRow` ✔; non-element node handling decided and
  recorded (comments skipped, whitespace-only text omitted, other text
  truncated at 40 chars) ✔; child-boundary link verified against a real
  fragment-root child (a two-node range, not just a single-element one) via
  both a unit test and a real-Chromium browser test ✔; unit tests for the
  pure walk/format/boundary logic, controller wiring tests, and a
  `tests/browser` scenario against the real playground-style fixture app (not
  jsdom) ✔ — all four test layers the criteria asked for are present.

  **Verified** (each count attributed to this task, re-run standalone):
  - `packages/overlay/src/elements.test.ts` (new): 17 tests, `vitest run
    src/elements.test.ts` → 17 passed.
  - `packages/overlay/src/controller.test.ts`: +6 tests (new "Elements pane"
    describe block), 114 total in the file, `vitest run
    src/controller.test.ts` → 114 passed.
  - `packages/overlay/src/options.test.ts`: +2 tests, 13 total, → 13 passed.
  - `packages/overlay/src/persistence.test.ts`: +2 tests, 17 total, → 17
    passed.
  - `packages/overlay/src/overlay.test.ts`: +6 new tests plus 1 existing
    assertion updated (sidebar now lists Components/Elements/History/
    Settings), 65 total, → 65 passed.
  - Full `packages/overlay` package: `vitest run` → 392 passed, 19 files.
    `tsc -p tsconfig.json --noEmit` clean; `tsc -p tsconfig.json` (declaration
    build) clean.
  - `packages/adapter-kit/src/options.test.ts`: +4 tests, 27 total, → 27
    passed. Full package: `vitest run` → 50 passed, 5 files. `tsc --noEmit`
    clean.
  - `packages/vite`/`rollup`/`esbuild`/`webpack`: no code changes (each
    re-exports `MithrilInspectorOptions` unchanged) — re-typechecked all
    four individually, clean.
  - `tests/browser/src/elements-pane.test.ts` (new, real Chromium via
    Puppeteer against the existing `UserList`/`UserCard` fixture — a real
    parent/child-component DOM boundary, not a synthetic jsdom one): 3
    passed, standalone and as part of the full suite (33 passed, 13 files, up
    from 30/12).
  - Whole workspace: `pnpm -r typecheck` (20 projects) and `pnpm -r test`
    (every package including `tests/browser`'s real-Chromium suite) both
    green after `pnpm build`, no regressions anywhere.

  **Known limitations, honestly scoped**:
  - Non-element node handling (comments skipped, text truncated at a fixed
    40 chars) is a reasonable default, not something the Acceptance Criteria
    specified beyond "decide and record" — no settings-tab control was added
    for the truncation length, mirroring how task 0029/0030 left their own
    fixed constants (`slowRenderThresholdMs`, `FLASH_DURATION_MS`)
    unconfigurable from the UI.
  - `maxNodes`/`maxDepth` (500/40) are fixed constants, not exposed as an
    option — nothing in the criteria asked for that, and they're generous
    enough that no fixture or real app screen hit them in testing.
  - A child boundary is only detected via *direct* `childIds` (per Context
    point 5) — a grandchild component nested inside a plain-DOM wrapper the
    selected component itself owns is never reached by this walk in the
    first place (the direct child's own boundary stops the descent before
    that point), so there is nothing further to special-case there.

  **⚠ Not committed — pre-existing uncommitted work already in this tree,
  unrelated to this task, entangled in files this task also had to touch.**
  Before writing anything, `git status`/`git diff` at commit time (not at
  task start — this task's own session never ran a git-status check until
  the end) revealed the working tree already contained a separate, complete,
  well-tested feature: a Settings-tab sidebar "unread diagnostics count"
  badge (`OverlayViewState.diagnosticsUnreadCount`, `controller.ts`'s
  `diagnosticsSeenCount`/`diagnosticsUnread()`, `view.ts`'s `sidebarButton`
  `badge` param and `.mi-sidebar-badge` CSS, `icons.ts`'s icon functions
  gaining an `IconOptions` size parameter, `styles.ts`'s sidebar button
  32px→36px resize) plus a matching client+server "editor launch failure is
  always logged to the console" fix
  (`controller.ts`'s `warnEditorFailure`, `packages/server/src/handle-
  request.ts`'s equivalent `console.warn`, both with their own tests already
  written). None of this is referenced by any existing `TASKS/*.md` file and
  none of it was written by this task. `packages/server/src/handle-
  request.ts`/`.test.ts` are cleanly separable (this task never touched
  them) and are simply left unstaged. `controller.ts`, `view.ts`, `icons.ts`
  and `styles.ts`, however, have this task's own hunks interleaved with that
  other feature's hunks in the same functions (e.g. `doOpenLocation`, the
  persisted-state seeding block, `sidebarButton`/`sidebar`) — a plain `git
  add` on those four files would stage both bodies of work together, and
  this task's own commit instructions say to flag that rather than decide
  unilaterally. Every other touched/created file (`elements.ts`,
  `elements.test.ts`, `elements-pane.test.ts`, `options.ts`/`.test.ts`,
  `persistence.ts`/`.test.ts`, `index.ts`, `controller.test.ts`,
  `overlay.test.ts`, both `README.md`s, `adapter-kit/*`) is cleanly this
  task's own work only. Flagged to the user; not committed pending their
  direction.

- 2026-07-22 claude: **Resolved and committed, per user direction ("commit
  everything together" plus a specific rewritten message for the unrelated
  work).** Split into two commits rather than one, since the user's own
  message was scoped only to the diagnostics-badge/editor-warning feature:
  temporarily backed out this task's own hunks from the four entangled files
  (`controller.ts`, `view.ts`, `icons.ts`, `styles.ts`) down to a verified
  (typecheck + full `packages/overlay` suite green) "pre-existing feature
  only" state, staged exactly those four files plus the untouched
  `packages/server/src/handle-request.ts`/`.test.ts`, and committed as
  `5b524c4 fix(overlay): surface editor-launch failures and add a
  diagnostics badge` (the user's message, lightly reformatted for the
  commit-message convention). Then restored every one of this task's own
  hunks on top of that new baseline, re-verified (`tsc --noEmit` clean,
  `vitest run` → 392/392 in `packages/overlay`, `pnpm -r typecheck` clean,
  `pnpm build` + `pnpm -r test` green across all 20 workspace projects
  including the real-Chromium `tests/browser` suite), and committed
  everything this task actually touched as `fc27e60 feat(overlay): add
  Elements tab for per-component DOM/vnode expansion`. Working tree clean
  after both commits.

- 2026-07-22 claude: **Follow-up refinement, same task, two user-requested
  changes to the Elements tab's row rendering.**

  1. **Inline text.** An element's own direct text children now render
     inline on the element's own row (e.g. `h2 Attrs demo`) instead of as
     separate nested rows — since an element typically either has more
     markup underneath it or some text content, rarely both needing their
     own line. `ElementsPaneNode`'s "element" variant gained `inlineText:
     readonly string[]` (its direct text children, in order); `children` now
     holds only element/component children. `elements.ts`'s
     `partitionTextChildren` does the split once, right where an element
     node is constructed from its already-walked children. New
     `formatInlineText`/`formatInlineTextList`: ordinary text renders trimmed
     and unquoted; pure whitespace (a deliberate separator between two
     inline elements — previously *dropped entirely* by the walk, per user
     request now kept) renders quoted via `JSON.stringify` (e.g. `" "`, or
     `"\t"`/`"\n"` for a tab/newline separator) so it isn't silently
     invisible. Two real CSS bugs found and fixed only by actually rendering
     this in a browser (`browser-tools` skill against
     `apps/playground-vite`, not just unit tests) rather than just trusting
     the DOM-structure assertions:
     - Zero vertical padding on `.mi-elements-tree > li` made every row sit
       flush against the next (fixed: `padding: 3px 0`, mirroring
       `.mi-tree-row`'s own padding).
     - `.mi-elements-row`/`.mi-elements-text`'s `display: inline-block`
       silently collapsed the leading space `view.ts` puts before an
       element's inline text, since an inline-block box establishes its own
       line-box context and trims leading/trailing whitespace inside itself
       the same way a real line-start would — even though the space was
       genuinely present in the DOM text content (confirmed via
       `element.textContent` before finding the CSS cause). Fixed: both
       changed to plain `display: inline`.
  2. **Click to jump to source.** Every element row (and a standalone
     top-level text row — only reachable when a fragment-root component's
     own range includes a bare text node as one of its top-level siblings)
     is now a `<button>` that resolves and opens its own nearest source via
     a new `OverlayController.openDomNodeSource(node: Node)`, reusing the
     same `hook.resolveDomSource` the picker's hover/click already uses —
     deliberately *not* routed through the shared selection (§9.3's
     selection sync), since this is a direct "open" action like the
     toolbar's own "Open in editor" icon, not a "select this". The inline
     text appended after an element's own tag label stays a plain,
     non-interactive `<span>` — it never retained a DOM node reference
     (folded into `inlineText` as plain strings), and the adjacent tag label
     is already one click away. Shared `.mi-elements-clickable` CSS
     (button-reset, underline-on-hover/focus only — no permanent accent
     color, so a row still reads as plain hyperscript text at rest).

  **Verified** (re-run standalone):
  - `packages/overlay/src/elements.test.ts`: 26 tests (was 17 at the parent
    task's own commit) — `vitest run src/elements.test.ts` → 26 passed.
    Covers: `formatInlineText`/`formatInlineTextList` (quoting rule,
    JSON.stringify escaping), the text/element split (including a
    `<label>"Name:"<input></label>`-shaped fixture — text and an element
    child coexisting on the same node), whitespace-only text kept (not
    dropped) and truncated the same as meaningful text, and a dedicated
    `domNode` identity test for both an element row and a standalone text
    row.
  - `packages/overlay/src/controller.test.ts`: 116 tests (was 114) —
    `vitest run src/controller.test.ts` → 116 passed. Adds
    `openDomNodeSource`'s happy path (opens via the resolved location,
    doesn't touch `selection.node`) and its no-source-resolved diagnostic
    path.
  - `packages/overlay/src/overlay.test.ts`: 66 tests (was 65) — `vitest run
    src/overlay.test.ts` → 66 passed. Adds a real-DOM click test
    (`vi.spyOn(controller, "openDomNodeSource")`) proving the rendered
    button reaches the controller with the exact clicked DOM node —
    `openInEditor`'s own network effect isn't injectable through
    `mountInspectorOverlay` (only `createOverlayController`'s own deps
    expose that), so that part stays covered at the controller-test.ts
    level per this file's own established pattern.
  - Full `packages/overlay` package: `vitest run` → 404 passed, 19 files.
    `tsc -p tsconfig.json --noEmit` clean.
  - `tests/browser/src/elements-pane.test.ts`: 6 tests (was 3) — `vitest run
    src/elements-pane.test.ts` → 6 passed, real Chromium. New: clicking
    `div.user-list-scene`'s row (`UserList`'s own root) launches the stub
    editor with the exact file/line/column (`harness/source-line.ts`'s
    `positionOf`, the same assertion style `editor-endpoint.test.ts` already
    uses for the toolbar's own "Open in editor"), and a structural check
    that `UserCard`'s inline-appended text renders as a plain `SPAN`, never
    a `BUTTON`, alongside its clickable `BUTTON` tag label.
  - Whole workspace after `pnpm build`: `pnpm -r typecheck` (20 projects)
    and `pnpm -r test` (every package, including `tests/browser`'s real
    suite: 13 files, 36 tests) both green, no regressions.
  - Visually verified live in a real browser (`apps/playground-vite`,
    `browser-tools` skill, not just automated tests) before and after each
    CSS fix — screenshots confirmed both the row-padding and the
    inline-text-spacing bugs, and confirmed both fixes.

  **Known limitation, honestly scoped**: only an element row and a
  standalone top-level text row carry a `domNode` reference; text folded
  into an element's own `inlineText` does not (by design — see point 2
  above), so it has no click-to-source affordance of its own. This wasn't
  asked for and would need retaining a node reference per inline-text
  segment, a larger change than what was requested.
