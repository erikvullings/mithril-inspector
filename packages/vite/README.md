# @mithril-inspector/vite

The Vite integration for Mithril Inspector. It only
*integrates* the bundler-neutral layers — the shared transform
(`@mithril-inspector/transform`), the runtime (`@mithril-inspector/runtime`), the
overlay (`@mithril-inspector/overlay`) and the open-in-editor server
(`@mithril-inspector/server`) — and adds no transform or editor logic of its own.

![Mithril Inspector: picking a component, drilling into its rendered DOM via the Elements tab, watching its attrs/state History timeline, and the redraw-flash visualization](https://raw.githubusercontent.com/erikvullings/mithril-inspector/main/docs/media/inspector-demo.gif)

## Zero-config usage

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { mithrilInspector } from "@mithril-inspector/vite"

export default defineConfig({
  plugins: [mithrilInspector()],
})
```

No application-code changes are required: no wrapping components, no replacing
the `m` import, no `m.mount`/`m.route` edits, and no entry-file edits — the
overlay bootstrap is injected into the page HTML.

`mithrilInspector(options?)` returns a **two-plugin array**.

## Development-only

`enabled` defaults to `process.env.NODE_ENV !== "production"`. Both plugins also
carry an `apply` gate that disables them during `vite build` unless
`includeInProduction` is set, so production bundles contain **no** runtime
registration, overlay or editor endpoint — verified by a real `vite build` test.

## Options

```ts
mithrilInspector({
  enabled,            // master switch (default: dev only)
  includeInProduction,// keep it in production builds (default false)
  include, exclude,   // FilterPattern for which modules to instrument
  root, projectRoots, // editor-endpoint roots
  editor,             // "code" | "cursor" | … | { command, args } (default "code" with no env var set)
  pathMappings,       // remote-path rewrites
  mode,               // "source" | "components" | "full" (default "full")
  ui:            { enabled, defaultOpen, theme, zIndex },
  picker:        { enabled, toggleShortcut, holdShortcut, openOnClick, continuous },
  componentTree: { enabled, captureAttrs, captureState },
  elementsPane:  { showTagName }, // Elements tab hyperscript labels (default true: "div.scroll" vs. ".scroll")
  source:        { elements, components, attributes, textExpressions, exposeDomAttributes },
  mithrilImports, hyperscriptIdentifiers, // Mithril import/alias detection
  debug,              // gate the diagnostics endpoint and runtime log-once
  redact,             // attrs/state redaction policy
})
```

`componentTree` is passed straight through to the overlay's Components tab:
`enabled` (default `true`) gates the full component tree UI
itself. `captureAttrs`/`captureState` gate the attrs/state preview panels
specifically; both **default to `true` once `mode` resolves to `"full"`**
(and to `false` otherwise) — `"full"` mode itself is defined as including
attrs/state, so the zero-config default (`mode: "full"`) already shows them
without opting into two more flags. Set either explicitly (e.g. `captureState:
false`) to keep `"full"` mode's other diagnostics while still suppressing
one of the preview panels, or set `mode: "source"` for the lighter
zero-tracking experience.

The resolved editor command (whichever of `editor` / `MITHRIL_INSPECTOR_EDITOR` /
`LAUNCH_EDITOR` / `VISUAL` / `EDITOR` / the `"code"` default actually won) is
shown read-only in the overlay's Settings tab, alongside the same override
instructions — the browser never chooses what the open-in-editor endpoint
launches, so there is no control to change it there.

Set `editor` explicitly rather than relying on that fallback chain: an
ambient `$EDITOR`/`$VISUAL` in the shell that started your dev server (many
shell profiles export `EDITOR=vi` or similar) silently wins over the `"code"`
default, with no error — the endpoint still reports success, since the
process did start. A terminal editor (`vi`, `vim`, `nvim`, `emacs`, `nano`)
can never work here regardless of how it's selected: `spawnEditorProcess`
always launches detached with no terminal attached, so it starts and exits
without ever visibly opening. The Settings tab flags this inline when the
resolved command is one of these.

## Virtual modules

Two virtual modules are served with `\0`-prefixed resolved ids:

- `virtual:mithril-inspector/runtime` — re-exports the transform-facing helpers
  (`registerModule` / `source` / `component`) and installs a runtime configured
  with `mode` / `debug` / `exposeDomAttributes` / `redact` on the global hook
  before any instrumented module registers. The transform points its injected
  import at this specifier.
- `virtual:mithril-inspector/overlay` — imports the runtime module, then mounts
  the shadow-root overlay once the DOM is ready. Injected via `transformIndexHtml`.

## Plugin order

The instrumenting plugin is **`mithril-inspector:pre`** with `enforce: "pre"`, so
it sees the original TypeScript/JSX *before* Vite's esbuild TS/JSX transform
lowers it. JSX is handled at the AST level, so no separate post-transform
plugin is needed; the plugin only splits along concerns:

1. `mithril-inspector:pre` (`enforce: "pre"`) — `resolveId`/`load` (virtual
   modules), `transform` (instrument, preserve source maps, skip
   `node_modules`/self/generated), and `handleHotUpdate` (invalidate, ADR-106).
2. `mithril-inspector:serve` — `transformIndexHtml` (overlay bootstrap) and
   `configureServer` (open-in-editor middleware, plus a diagnostics endpoint in
   `debug` mode).

## HMR (ADR-106)

On a hot update of an instrumented file, `handleHotUpdate` sends a
`mithril-inspector:invalidate` message with the file's stable module id. The
runtime bootstrap invalidates that module's stale source table; the re-executed
module's own `registerModule` restores a fresh one. Selection survival is
computed lazily in the overlay, so no selection state crosses the HMR boundary.

## Privacy

Component attrs/state are never sent to the dev server; the editor endpoint
receives only `{ file, line, column }`. Default redaction key patterns (password,
token, cookie, …) are wired into the runtime bootstrap config.

## Optional DOM metadata

`source.exposeDomAttributes: true` adds a compact `data-mi="m:<hash>:s2"`
attribute to element vnodes (no absolute paths). Off by default.
