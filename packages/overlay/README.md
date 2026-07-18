# @mithril-inspector/overlay

The in-page inspector UI for Mithril Inspector (REQUIREMENTS.md §4, §8). It is
itself written in Mithril.js and mounts into an isolated shadow root, so it adds
no global styles and cannot clash with the host application's CSS. No Vite or
bundler dependencies (ADR-004): it depends only on `@mithril-inspector/protocol`
(types) and `mithril`, and consumes the runtime hook (0010) through the global
`window.__MITHRIL_INSPECTOR__` rather than importing the runtime package.

Phase 1 ships the **source inspector** (§21): a collapsed bottom tab, an element
picker, highlight rectangles, a source tooltip/badge, and a selected-element
details panel with **Open in editor**.

## Mounting

```ts
import { mountInspectorOverlay } from "@mithril-inspector/overlay"

const handle = mountInspectorOverlay({
  position: "bottom-right",
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

- **Tab & panel (§8.1, §8.3):** collapsed tab fixed to a configurable corner;
  drag it (or the panel header) to move it. Position, collapsed state, the
  active tab, and the Components tab's search query all persist in
  `localStorage` — deliberately, since a Vite dev-server WebSocket reconnect
  (e.g. after "Reveal component" backgrounds the browser tab long enough for
  it to drop) triggers a full page reload (Vite's own behavior, not this
  package's), which would otherwise silently reset the panel back to the
  Inspector tab. Expanded tabs are `[ Inspector ] [ Components ] [ Settings ]`.
- **Picker (§8.4):** toggle with `Alt+Shift+M`, momentary hold with `Alt+Shift`,
  `Enter` opens the current source, `Escape` cancels. Every shortcut is
  remappable and can be disabled (`"none"`). Plain `Alt+Click` is never bound.
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
- **Ancestry panel & reveal component (§8.3, §9.1, §9.3, task 0019):** the
  "Component ancestry" section lists the full root-first chain (`App` →
  `UserList` → `UserCard`) for the selected element's owning component, each
  with its own resolved (and exact-vs-inferred marked) display name. Clicking
  an ancestor's name (`focusAncestor`) highlights its own rendered DOM range
  — every top-level sibling node for a fragment-root component, not just the
  first — without changing what's selected. Each ancestor and the "Selected"
  section's own **Reveal component** button open a component's source via
  `revealComponent`, defaulting to the most-precise of up to three §9.3
  locations (rendered element → component view → component declaration); an
  "Open: …" button group is shown only when more than one actually resolved
  (§2.4 degrade), and a component inside a hidden (`markInspectorHidden`)
  ancestor's subtree is excluded from the chain rather than leaving a gap.
- **Component tree (§9, §9.3, §9.4, task 0022):** the Components tab shows the
  full Mithril component hierarchy — display names and `key="…"` badges (§9.1
  `UserCard key="42"`), plain HTML elements excluded by default — seeded once
  from `hook.getSnapshot()` and thereafter patched incrementally from batched
  `RuntimeEvent`s via `hook.subscribe` (§9.4: no re-fetch, no full rebuild per
  redraw). Each row shows an update-count badge (§3.2) and can be
  expanded/collapsed (chevron, or `ArrowRight`/`ArrowLeft`; `ArrowUp`/`ArrowDown`
  move a roving `tabindex`, `Enter`/`Space` select — a flat `role="tree"` with
  `aria-level` per row rather than physically nested `role="group"`s, §18).
  Selection is bidirectional and shared with the Inspector tab (§9.3): picking
  a DOM element marks its nearest component selected in the tree, and selecting
  a tree row highlights that component's own DOM range, offers **Scroll into
  view**, and exposes the same **Reveal component** / "Open: rendered element /
  component view / component declaration" source actions as the ancestry panel.
  A search box filters by display name, keeping every match's ancestors visible
  for context. Pinned components (§3.2, `📌`) stay listed with a "not mounted"
  marker instead of disappearing once they unmount (ids are never reused, so
  that's the last state they'll ever report). The whole tab is gated by
  `componentTree.enabled` (§11.1); attrs/state previews additionally require
  `mode: "full"` and `componentTree.captureAttrs`/`captureState` — each shows an
  explanatory message instead of silently doing nothing when a prerequisite
  isn't met. Attrs/state render the lazy preview tree from task 0020's safe
  serializer: containers show their already-fetched entries inline with a
  "Show more" page-forward button once truncated, a getter shows `(...)` until
  clicked (`expandComponentPreview` → the hook's `expandPreview`, evaluated only
  on that explicit action, §7.4), and a redacted value always renders its
  configured replacement text (default `[redacted]`, §15) — the redaction
  itself happens in the runtime, never in this package.
- **Accessibility (§18):** semantic controls, ARIA roles (`dialog`, `tablist`,
  `tab`, `status`, `tree`, `treeitem`), visible focus indicators, WCAG AA
  contrast, reduced-motion support (also respected by "Scroll into view", via
  `matchMedia`), a visible picker-active banner, and light/dark theming that
  follows `prefers-color-scheme` by default.
- **Resilience (§16):** every overlay operation runs inside an error boundary;
  failures are recorded and surfaced in the Settings panel's diagnostics view,
  and never break the host application.

## Public building blocks

`mountInspectorOverlay` is the entry point, but the composable pieces are also
exported for tooling and tests: `createOverlayController`, `OverlayRoot` (the
Mithril component), `resolveOverlayOptions`, `getOverlayHook`, `describeMapping`,
`createPickerMachine`, `createSelectionModel`, `createFrameScheduler`,
`createEditorClient`, `parseShortcut`, the persistence helpers, and (task 0022)
`createComponentTreeStore` plus the preview-tree formatters `summarizeNode`,
`isExpandable` and `pathKey`.

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
  the active tab and Components-tab search query do, both via `localStorage`
  — see "Tab & panel" above). A `ComponentId` is only valid for the page load
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
  diagnostic (visible in the Settings panel once the dialog closes, and via
  `console.warn` in `debug` mode) so the silence is explained rather than
  silently swallowed. Ordinary custom "modal" UIs built from a plain
  `position: fixed` div are unaffected — the overlay's host already always wins
  normal z-index stacking (`z-index: 2147483000`, last child of `document.body`).
