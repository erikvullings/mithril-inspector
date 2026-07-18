# @mithril-inspector/vite

The Vite integration for Mithril Inspector (REQUIREMENTS.md §4, §11). It only
*integrates* the bundler-neutral layers (§5) — the shared transform
(`@mithril-inspector/transform`), the runtime (`@mithril-inspector/runtime`), the
overlay (`@mithril-inspector/overlay`) and the open-in-editor server
(`@mithril-inspector/server`) — and adds no transform or editor logic of its own.

## Zero-config usage (§2.2)

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

`mithrilInspector(options?)` returns a **two-plugin array** (§11.1).

## Development-only (§2.1, §20.1.12)

`enabled` defaults to `process.env.NODE_ENV !== "production"`. Both plugins also
carry an `apply` gate that disables them during `vite build` unless
`includeInProduction` is set, so production bundles contain **no** runtime
registration, overlay or editor endpoint — verified by a real `vite build` test.

## Options (§11.1, §17)

```ts
mithrilInspector({
  enabled,            // master switch (default: dev only)
  includeInProduction,// keep it in production builds (default false)
  include, exclude,   // FilterPattern for which modules to instrument
  root, projectRoots, // editor-endpoint roots (§10.2, §10.4)
  editor,             // "code" | "cursor" | … | { command, args } (§10.3)
  pathMappings,       // remote-path rewrites (§10.4)
  mode,               // "source" | "components" | "full" (§17; default "source")
  ui:            { enabled, defaultOpen, theme, zIndex },
  picker:        { enabled, toggleShortcut, holdShortcut, openOnClick, continuous },
  componentTree: { enabled, captureAttrs, captureState },
  source:        { elements, components, attributes, textExpressions, exposeDomAttributes },
  mithrilImports, hyperscriptIdentifiers, // Mithril import/alias detection (§6.4)
  debug,              // gate the diagnostics endpoint and runtime log-once (§16)
  redact,             // attrs/state redaction policy (§15)
})
```

`componentTree` is passed straight through to the overlay's Components tab
(task 0022): `enabled` (default `false`) gates the full component tree UI
itself. `captureAttrs`/`captureState` gate the attrs/state preview panels
specifically; both **default to `true` once `mode` resolves to `"full"`**
(and to `false` otherwise) — §17 defines `"full"` mode itself as including
attrs/state, so `mode: "full"` alone is enough to see them without also
opting into two more flags. Set either explicitly (e.g. `captureState:
false`) to keep `"full"` mode's other diagnostics while still suppressing
one of the preview panels.

## Virtual modules (§11.2)

Two virtual modules are served with `\0`-prefixed resolved ids:

- `virtual:mithril-inspector/runtime` — re-exports the transform-facing helpers
  (`registerModule` / `source` / `component`) and installs a runtime configured
  with `mode` / `debug` / `exposeDomAttributes` / `redact` on the global hook
  before any instrumented module registers. The transform points its injected
  import at this specifier.
- `virtual:mithril-inspector/overlay` — imports the runtime module, then mounts
  the shadow-root overlay once the DOM is ready. Injected via `transformIndexHtml`.

## Plugin order (§11.3)

The instrumenting plugin is **`mithril-inspector:pre`** with `enforce: "pre"`, so
it sees the original TypeScript/JSX *before* Vite's esbuild TS/JSX transform
lowers it. JSX is handled at the AST level (§6.6), so no separate post-transform
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

## Privacy (§15)

Component attrs/state are never sent to the dev server; the editor endpoint
receives only `{ file, line, column }`. Default redaction key patterns (password,
token, cookie, …) are wired into the runtime bootstrap config.

## Optional DOM metadata (§13)

`source.exposeDomAttributes: true` adds a compact `data-mi="m:<hash>:s2"`
attribute to element vnodes (no absolute paths). Off by default.
