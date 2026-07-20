# @mithril-inspector/overlay

The in-page inspector UI for Mithril Inspector (REQUIREMENTS.md §4, §8). It is
itself written in Mithril.js and mounts into an isolated shadow root, so it adds
no global styles and cannot clash with the host application's CSS. No Vite or
bundler dependencies (ADR-004): it depends only on `@mithril-inspector/protocol`
(types) and `mithril`, and consumes the runtime hook (0010) through the global
`window.__MITHRIL_INSPECTOR__` rather than importing the runtime package.

Phase 1 ships the **source inspector** (§21): an unobtrusive collapsed toggle,
an element picker, highlight rectangles, a source tooltip/badge, and a
selected-component detail pane with **Open in editor**. The panel's
look-and-feel follows the Vue DevTools convention: an "M" toggle docked to the
bottom of the viewport when collapsed, and a full-width docked panel with a
left icon sidebar when expanded.

## Mounting

```ts
import { mountInspectorOverlay } from "@mithril-inspector/overlay"

const handle = mountInspectorOverlay({
  theme: "system",
  picker: { toggleShortcut: "Alt+Shift+M", continuous: false },
})
// handle.dispose() tears down listeners, unmounts Mithril, and removes the host.
```

`mountInspectorOverlay(options?, deps?)` creates `<div id="__mithril-inspector-host">`
on `document.body`, attaches an (open by default) shadow root, injects the scoped
stylesheet, mounts the Mithril overlay, and calls `hook.excludeHost(host)` so the
overlay is excluded from element picking and runtime tracking (§8.2). It returns
`null` when disabled or when there is no DOM (e.g. a production build with the
runtime stripped, §2.1). `deps` lets you inject a `hook`, `document` and
`window` for testing.

## Behavior

- **Toggle & docked panel (§8.1, §8.3):** collapsed, the overlay is a small "M"
  toggle centered at the bottom of the viewport, faded to low opacity until
  hovered. Hovering (or picking) reveals a second target/crosshair icon next
  to it — a glowing halo appears — that starts picking directly without
  opening the panel. Expanded, the overlay docks a panel to the bottom of the
  viewport spanning the full width, with a left icon sidebar (Components, then
  State History, then Settings at the bottom; click the "M" mark at the top of
  the sidebar to collapse back to the toggle). Collapsed state, the active sidebar section,
  and the component tree's search query all persist in `localStorage` —
  deliberately, since a Vite dev-server WebSocket reconnect (e.g. after "Open
  in editor" backgrounds the browser tab long enough for it to drop) triggers
  a full page reload (Vite's own behavior, not this package's), which would
  otherwise silently reset the panel.
- **Picker (§8.4):** toggle with `Alt+Shift+M`, momentary hold with `Alt`,
  `Enter` opens the current source, `Escape` cancels. Every shortcut is
  remappable (right in the Settings tab, or via options) and can be disabled
  (`"none"`). Picking never jumps to the editor by itself (`picker.openOnClick`
  defaults to `false`) — a pick lands its result in the docked panel in place;
  `picker.openEditorModifier` (default Meta/Cmd/Win) jumps straight to the
  editor on click instead, and `picker.passThroughModifier` (default
  `Alt+Shift`) lets one click through to the app underneath without leaving
  picking mode (§8.7).
- **Hover (§8.5) & highlight (§8.6):** a capture-phase pointer listener uses
  `document.elementsFromPoint`, ignores the overlay host, resolves the best
  source/component mapping through the hook, and draws separate fixed-position
  rectangles from `getBoundingClientRect` — never touching the target's styles.
  Pointer, scroll and resize work is coalesced to one update per animation
  frame (§17).
- **Selection (§8.7):** clicking suppresses the application click by default
  (hold `Meta`/Cmd to pass it through), freezes the highlight, shows the details
  panel, and exits the picker unless continuous mode is on.
- **Stale nodes (§8.8):** a removed selection shows "Element no longer mounted"
  and offers to reselect the nearest still-mounted ancestor. The selected node
  and its ancestor chain are held via `WeakRef`, so nothing is pinned in memory.
- **Mapping precision (§2.4):** the UI distinguishes an *exact* element source
  from an *inferred* fallback (component view → declaration → module) with a
  colored badge.
- **Display names (§9.2, §2.4, task 0018):** the hover badge and the details
  panel's "Component" row show the same colored "Inferred" badge next to a
  component name resolved via the §9.2 fallback tiers (filename-derived or
  `"Anonymous"`), so a guessed name is never mistaken for an explicit or
  declared one.
- **Ancestry breadcrumb & source actions (§8.3, §9.1, §9.3, task 0019):** the
  detail pane's breadcrumb shows the full root-first chain (`App › UserList ›
  UserCard`) for the selected element's owning component, each crumb its own
  resolved (and exact-vs-inferred marked) display name. Clicking a crumb
  (`focusAncestor`) highlights its own rendered DOM range — every top-level
  sibling node for a fragment-root component, not just the first — without
  changing what's selected; the toolbar's actions always stay scoped to the
  actually-selected component. The toolbar is one icon per action (the label
  is a tooltip, `title`/`aria-label`): **Open in editor** (the exact clicked
  element's own source, via `openSelectedInEditor`), then one icon per
  additional §9.3 location that actually resolved — component view,
  component declaration — skipping a redundant "rendered element" icon
  (`openSelectedInEditor` already covers that exact target), then pin, scroll
  into view, and clear. A component inside a hidden (`markInspectorHidden`)
  ancestor's subtree is excluded from the chain rather than leaving a gap.
- **Component tree (§9, §9.3, §9.4, task 0022):** the sidebar's Components
  section shows the full Mithril component hierarchy — display names and
  `key="…"` badges (§9.1 `UserCard key="42"`), plain HTML elements excluded by
  default — seeded once from `hook.getSnapshot()` and thereafter patched
  incrementally from batched `RuntimeEvent`s via `hook.subscribe` (§9.4: no
  re-fetch, no full rebuild per redraw). Each row shows an update-count badge
  (§3.2) and, once at least one of its own renders exceeded the runtime's
  slow-render threshold in `mode: "full"` (default 16ms — one 60fps frame
  budget, §17 diagnostics, task 0029), a `⚠ N` warning badge with the latest
  duration in its tooltip; the detail pane shows the same "Last render: Xms"
  line (styled as a warning once slow) for the selected component. Both stay
  hidden entirely outside `mode: "full"` — no gate message, since the tree's
  own badges already carry that signal. Rows can be expanded/collapsed (chevron, or `ArrowRight`/`ArrowLeft`;
  `ArrowUp`/`ArrowDown` move a roving `tabindex`, `Enter`/`Space` select — a
  flat `role="tree"` with `aria-level` per row rather than physically nested
  `role="group"`s, §18). Selection is bidirectional: picking a DOM element (via
  the target icon next to the tree search, or the collapsed toggle's own
  picker icon) marks its nearest component selected in the tree, and selecting
  a tree row highlights that component's own DOM range and shows the same
  detail pane described above. A search box filters by display name, keeping
  every match's ancestors visible for context. Pinned components (§3.2) stay
  listed with a "not mounted" marker instead of disappearing once they unmount
  (ids are never reused, so that's the last state they'll ever report). The
  tree pane is gated by `componentTree.enabled` (§11.1) — the detail pane's
  breadcrumb/toolbar work regardless, since they only need a DOM
  selection/mapping, not tree tracking; attrs/state previews additionally
  require `mode: "full"` and `componentTree.captureAttrs`/`captureState` —
  each shows an explanatory message instead of silently doing nothing when a
  prerequisite isn't met. Attrs/state render the lazy preview tree from task
  0020's safe serializer directly as a key/value list (no redundant "Object"
  label at the root): containers show their already-fetched entries inline
  with a "Show more" page-forward button once truncated, a getter shows
  `(...)` until clicked (`expandComponentPreview` → the hook's `expandPreview`,
  evaluated only on that explicit action, §7.4), and a redacted value always
  renders its configured replacement text (default `[redacted]`, §15) — the
  redaction itself happens in the runtime, never in this package.
- **State History (task 0027, refined task 0028):** a read-only timeline of
  the currently selected component's state preview, recorded each time it
  redraws (driven by the same batched `RuntimeEvent`s as the Components tab,
  §9.4 — no separate polling), newest first. The tab reuses the same left
  tree pane the Components tab has — selecting a component there keeps the
  history in sync — plus its own "Watching: `<name>`" heading, so it's always
  clear whose state is being recorded. Selecting an entry shows a diff against
  its own immediate predecessor; a `"changed"` object/array field expands into
  an aligned two-column before/after table (row-per-key/index) instead of a
  bare `Array(3) → Array(4)`, and an added/removed object/array field expands
  into a single fully-nested column — both non-interactive, static renderings
  of the frozen historical snapshot (no getter evaluation, no live round-trip,
  unlike the Components tab's own attrs/state preview). The selection
  auto-follows new snapshots as long as whatever was selected was itself the
  latest entry at the time; explicitly pinning an older entry keeps it pinned
  across future recordings. Gated identically to the Components tab's
  Attrs/State sections (`mode: "full"` + `componentTree.captureState`). Built
  entirely from data the runtime hook already exposes for any component's
  `state` — most useful pointed at a root/layout component that receives a
  [Meiosis](https://meiosis.js.org) `cell().state` as its own state, the
  closest read-only analog to
  [meiosis-tracer](https://github.com/foxdonut/meiosis-tracer)'s timeline this
  package offers. There is deliberately no rewind/replay: pushing a historical
  snapshot back into a live app is out of scope (REQUIREMENTS.md §3.3 lists
  time-travel debugging as an explicit non-goal), and unlike this package's
  other instrumentation, meiosis-tracer's own time-travel needs a live
  reference to the app's actual state stream handed to it — something no
  zero-app-code-change strategy this project uses can obtain on its own.
- **Redraw-flash visualization (§21 Phase 5, task 0030):** opt-in
  (`redrawFlash.enabled`, off by default) and `mode: "full"`-only — a brief
  highlight over a component's own DOM range when its DOM *actually mutated*
  this redraw, not merely when its `view()` ran (every component's `view()`
  runs on every `m.redraw()` regardless of whether anything changed; Mithril's
  own diff only touches real DOM where the new/old vnode trees actually
  differ, and that's the signal this keys off). Detection is a single
  `MutationObserver` on `document.body` (`childList`/`attributes`/
  `characterData`, `subtree: true`) — deliberately not scoped to individual
  `m.mount` roots, since observing one stable ancestor that contains every
  root needs no root-discovery bookkeeping and handles multiple independent
  roots and roots that mount/unmount later for free. Mutation records are
  rAF-throttled (`createFrameScheduler`, mirroring the existing
  pointer-move/highlight-refresh scheduling) and resolved to owning
  components via the same `resolveDomComponent` the picker uses, so the
  existing `excludeHost` exclusion applies unchanged — reinforced by shadow
  DOM boundaries already being opaque to a light-DOM `MutationObserver` (the
  overlay's own UI lives entirely in its shadow root). Each flash fades over
  ~400ms and clears itself on a timer independent of whether it animates, so
  `prefers-reduced-motion` (§18) is satisfied by the existing global
  `.mi-root` reduced-motion rule alone — no separate check needed.
- **Accessibility (§18):** semantic controls, ARIA roles (`dialog`, `status`,
  `tree`, `treeitem`), visible focus indicators, WCAG AA contrast,
  reduced-motion support (also respected by "Scroll into view", via
  `matchMedia`), a visible picker-active banner, and light/dark theming that
  follows `prefers-color-scheme` by default.
- **Resilience (§16):** every overlay operation runs inside an error boundary;
  failures are recorded and surfaced in the Settings section's diagnostics
  view, and never break the host application.

## Public building blocks

`mountInspectorOverlay` is the entry point, but the composable pieces are also
exported for tooling and tests: `createOverlayController`, `OverlayRoot` (the
Mithril component), `resolveOverlayOptions`, `getOverlayHook`, `describeMapping`,
`createPickerMachine`, `createSelectionModel`, `createFrameScheduler`,
`createEditorClient`, `parseShortcut`, the persistence helpers, (task 0022)
`createComponentTreeStore` plus the preview-tree formatters `summarizeNode`,
`isExpandable` and `pathKey`, (task 0027/0028) `createHistoryStore`,
`diffPreviewNodes`, `containerEntries` and `alignContainerEntries`, and (task
0030) `componentsWithMutatedDom` — the pure DOM-mutation-to-component
attribution logic behind redraw-flash detection.

## Editor endpoint

Opening a source POSTs `{ file, line, column }` (only — never component data,
§15) to `POST /__mithril-inspector/open-in-editor`, served by
`@mithril-inspector/server` (0011) and wired up by the Vite adapter (0013).

## Notes on styling

`mithril-materialized` was evaluated for the panel but not used: it ships global
CSS, which conflicts with the shadow-root / no-global-styles constraint (§8.1,
§8.2). The overlay uses a self-contained, shadow-scoped stylesheet instead
(`styles.ts`).

## Known Phase 1/3 limitations

- **Expanding a component into its owned vnode/element tree (§9.1's "optional"
  sub-feature) is not implemented.** The tree always shows only the Mithril
  component hierarchy; there is no per-component toggle to reveal the plain
  DOM/vnode subtree it renders. Everything else in the acceptance criteria
  (display names/keys, search, pinning, update counters, bidirectional
  selection sync, attrs/state previews, incremental batched updates) is
  implemented — this one sub-feature is deliberately deferred, per the
  requirement's own "optional" wording, rather than silently dropped.
- **Large trees are not virtualized** (no windowing library). Collapsing a
  node does stop its subtree from being rendered at all, which is the cheap
  half of "virtualize or lazily render large trees" (§17); true virtualization
  of a fully-expanded huge tree is a follow-up.
- **Attrs/state pagination replaces the shown page rather than accumulating
  it.** Clicking "Show more" on a truncated container re-fetches and displays
  entries `[offset, offset + maxEntries)` (the runtime's `expandPreview`
  contract, task 0020) instead of appending to what's already shown — simpler
  and still fully "paginated" per the acceptance criteria, but not an
  infinite-scroll accumulation.
- **The selected component itself does not survive a Vite full-reload** (only
  the active sidebar section and component tree search query do, both via
  `localStorage` — see "Toggle & docked panel" above). A `ComponentId` is only valid for the page load
  that assigned it, so after a reload the previous selection can't be
  re-applied directly; re-resolving the nearest matching component by its old
  source location was considered and deferred as a larger, separate piece of
  work.
- Highlight margins/padding visualization is deferred (§8.6, "later release").
- Real-browser integration (playground, Chromium/Firefox/Safari) is exercised by
  the Vite playground (0014) and browser tests (0015); this package is unit- and
  jsdom-tested in isolation.
- **A native `<dialog>` opened with `showModal()` blocks the overlay entirely.**
  `showModal()` promotes the dialog into the browser's top layer, which paints
  above the shadow-root host regardless of z-index, and makes the rest of the
  document inert — pointer *and* keyboard events aimed at the overlay never
  arrive while the dialog is open (confirmed empirically: a bare capture-phase
  `keydown` listener on `document` receives zero events, even though
  `document.activeElement` correctly sits inside the dialog). There is no
  supported way to intercept or work around this from outside the dialog's own
  subtree — a real fix would mean promoting the overlay itself into the top
  layer (Popover API), which only helps interacting with the overlay (not
  picking elements hidden behind the dialog anyway) and is out of scope for
  Phase 1. Instead, `mountInspectorOverlay` watches for `:modal` via a
  `MutationObserver` on the `open` attribute and records a `"modal-dialog"`
  diagnostic (visible in the Settings section once the dialog closes, and via
  `console.warn` in `debug` mode) so the silence is explained rather than
  silently swallowed. Ordinary custom "modal" UIs built from a plain
  `position: fixed` div are unaffected — the overlay's host already always wins
  normal z-index stacking (`z-index: 2147483000`, last child of `document.body`).
