# @mithril-inspector/rollup

The Rollup integration for Mithril Inspector. A
thin adapter over the shared transform (`@mithril-inspector/transform`) and
runtime (`@mithril-inspector/runtime`) — same option shape and instrumentation
behaviour as `@mithril-inspector/vite`, reused via
`@mithril-inspector/adapter-kit` rather than reimplemented (ADR-004).

![Mithril Inspector: picking a component, drilling into its rendered DOM via the Elements tab, watching its attrs/state History timeline, and the redraw-flash visualization](https://raw.githubusercontent.com/erikvullings/mithril-inspector/main/docs/media/inspector-demo.gif)

## Usage

```ts
// rollup.config.js
import { mithrilInspector } from "@mithril-inspector/rollup"

export default {
  input: "src/main.ts",
  plugins: [mithrilInspector()],
  output: { dir: "dist", format: "esm" },
}
```

`mithrilInspector(options?)` returns a **single** Rollup plugin (unlike the
two-plugin array `@mithril-inspector/vite` returns — Rollup has no HTML
transform hook to split off).

## What it does — and doesn't

This package covers:

- **AST transformation** — `transform` (registered with `order: "pre"` so it
  sees the original TypeScript/JSX before any other transform lowers it)
  calls the same `transformMithrilModule` every adapter uses.
- **Runtime import resolution** — `resolveId`/`load` serve
  `virtual:mithril-inspector/runtime` and `.../overlay`, exactly like the Vite
  plugin's virtual modules.
- **Watch mode** — Rollup re-runs `transform`/`load` for changed files
  automatically in `--watch`/`rollup.watch()`; the shared transform's own
  content-hash-keyed cache means a changed file simply produces a fresh
  cache entry, so no extra invalidation bookkeeping is needed here.
- **Source maps** — the transform's map is passed straight through in the
  `transform` hook's return value.

It does **not** inject the overlay into an HTML page (Rollup has no
`transformIndexHtml` equivalent) and does **not** register an open-in-editor
endpoint itself (Rollup is not a development server) — see below.

## Dev-only guard

Rollup has no `command === "build"` distinction the way Vite does; the
closest equivalent is `this.meta.watchMode`, which is `true` only when Rollup
is running via `--watch`/`rollup.watch()`. This plugin is active only when
`enabled` (default: `NODE_ENV !== "production"`) **and** either watch
mode is on or `includeInProduction` is set — so a plain one-off
`rollup.rollup()`/`rollup build` never emits inspector code by default
(verified by a real build in `tests/integration/`).

```ts
mithrilInspector({
  includeInProduction: true, // force it into a one-off (non-watch) build too
})
```

## Editor launching

Rollup isn't a development server, so — unlike the Vite plugin, which
registers the open-in-editor endpoint itself via `configureServer` — this
package does not start one for you. Pick one of these three patterns:

1. **Compatible dev-server integration.** If you already run your own
   Connect/Express/`node:http` dev server to serve the Rollup output, mount
   the same middleware the Vite plugin uses:

   ```ts
   import { createInspectorMiddleware } from "@mithril-inspector/server"

   app.use(createInspectorMiddleware({ root: projectRoot, editor: "code" }))
   ```

2. **A separately started inspector server.** Run a tiny companion script
   (alongside `rollup --watch`, e.g. via `concurrently`) using the standalone
   server added for this purpose:

   ```ts
   import { startInspectorServer } from "@mithril-inspector/server"

   const handle = await startInspectorServer({ root: projectRoot, editor: "code" })
   console.log(`Mithril Inspector editor endpoint: ${handle.url}`)
   ```

   It binds to `127.0.0.1` only and adds no CORS headers, so the app page
   must reach it same-origin — pattern 3 covers
   that.

3. **A configured/proxied endpoint URL.** Since patterns 1–2 require the
   endpoint to be same-origin with the page, and this package doesn't rewrite
   your app's own fetch target, put a reverse proxy in front of whatever
   serves the Rollup output that forwards `POST /__mithril-inspector/open-in-editor`
   to the standalone server's port (most static-file/dev-server tools —
   `browser-sync`, `http-server` + a small proxy middleware, etc. — support
   this in a few lines).

Pass `editor` explicitly, as in the examples above — leaving it unset falls
back to `MITHRIL_INSPECTOR_EDITOR`/`LAUNCH_EDITOR`/`VISUAL`/`EDITOR` from the
process's own environment before defaulting to `"code"`, and it can't be a
terminal editor (`vi`, `vim`, `nvim`, `emacs`, `nano`) either way — see
`@mithril-inspector/vite`'s README for why.

## Mounting the overlay

Because there's no HTML injection hook, importing the overlay is the
application's responsibility — guard it yourself so production builds stay
clean:

```ts
if (process.env.NODE_ENV !== "production") {
  import("virtual:mithril-inspector/overlay")
}
```

## Options

Same shape as `@mithril-inspector/vite` — see that package's README
for the full option reference (`include`/`exclude`, `root`/`projectRoots`,
`editor`, `pathMappings`, `mode`, `ui`, `picker`, `componentTree`, `source`,
`mithrilImports`/`hyperscriptIdentifiers`, `debug`, `redact`). `ui`/`picker`
mounting still applies once the app imports the overlay module itself, above.
