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
  drag it (or the panel header) to move it. Position and collapsed state persist
  in `localStorage`. Expanded tabs are `[ Inspector ] [ Components ] [ Settings ]`
  (Components is a placeholder until the component tree lands).
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
- **Accessibility (§18):** semantic controls, ARIA roles (`dialog`, `tablist`,
  `tab`, `status`), visible focus indicators, WCAG AA contrast, reduced-motion
  support, a visible picker-active banner, and light/dark theming that follows
  `prefers-color-scheme` by default.
- **Resilience (§16):** every overlay operation runs inside an error boundary;
  failures are recorded and surfaced in the Settings panel's diagnostics view,
  and never break the host application.

## Public building blocks

`mountInspectorOverlay` is the entry point, but the composable pieces are also
exported for tooling and tests: `createOverlayController`, `OverlayRoot` (the
Mithril component), `resolveOverlayOptions`, `getOverlayHook`, `describeMapping`,
`createPickerMachine`, `createSelectionModel`, `createFrameScheduler`,
`createEditorClient`, `parseShortcut`, and the persistence helpers.

## Editor endpoint

Opening a source POSTs `{ file, line, column }` (only — never component data,
§15) to `POST /__mithril-inspector/open-in-editor`, served by
`@mithril-inspector/server` (0011) and wired up by the Vite adapter (0013).

## Notes on styling

`mithril-materialized` was evaluated for the panel but not used: it ships global
CSS, which conflicts with the shadow-root / no-global-styles constraint (§8.1,
§8.2). The overlay uses a self-contained, shadow-scoped stylesheet instead
(`styles.ts`).

## Known Phase 1 limitations

- The Components tab and the "Component ancestry" section show a single nearest
  component only; the full expandable tree and multi-level ancestry arrive in
  later tasks (0019, 0022).
- Highlight margins/padding visualization is deferred (§8.6, "later release").
- Real-browser integration (playground, Chromium/Firefox/Safari) is exercised by
  the Vite playground (0014) and browser tests (0015); this package is unit- and
  jsdom-tested in isolation.
