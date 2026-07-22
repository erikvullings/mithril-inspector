# @mithril-inspector/webpack

The webpack and Rspack integration for Mithril Inspector. A thin adapter over
the shared transform (`@mithril-inspector/transform`)
and runtime (`@mithril-inspector/runtime`) — same option shape and
instrumentation behaviour as `@mithril-inspector/vite`/`rollup`/`esbuild`,
reused via `@mithril-inspector/adapter-kit` rather than reimplemented
(ADR-004). One package, one plugin, works unmodified on both bundlers — verified
against real `webpack()` **and** `rspack()` compilations in
`tests/integration/`, not just documented as "should work".

## Usage

```ts
// webpack.config.js
import { mithrilInspector } from "@mithril-inspector/webpack"

export default {
  mode: "development",
  entry: "./src/main.ts",
  plugins: [mithrilInspector({ editor: "code" })],
}
```

Rspack is the same import, the same plugin, the same config shape:

```ts
// rspack.config.js
import { mithrilInspector } from "@mithril-inspector/webpack"

export default {
  mode: "development",
  entry: "./src/main.ts",
  plugins: [mithrilInspector({ editor: "code" })],
}
```

`mithrilInspector(options?)` returns a single plugin object (`{ apply(compiler) }`)
built entirely from `compiler.options` mutation and `compiler.webpack`/
`compiler.rspack` back-references — it never imports `webpack` or `@rspack/core`
at runtime (both are optional peer dependencies; only type-only imports are
used), which is exactly why the same compiled code runs on either bundler.

## What it does — and doesn't

This package covers:

- **A loader for module transformation** — auto-registered as an
  `enforce: "pre"` rule (so it always runs first, directly on the original
  TypeScript/JSX source, before ts-loader/babel-loader lower it) and calls the
  same `transformMithrilModule` every adapter uses. Its output source map is
  handed to whichever loader runs next as their `inputSourceMap` — how webpack
  chains loader source maps.
- **A plugin for virtual/runtime entry injection** — the overlay bootstrap is
  injected into every entry via `EntryPlugin` (see below), no application
  entry-file edit required; the runtime import instrumented modules use is
  wired through `resolve.alias`.
- **Dev-server middleware for editor launching** — `compiler.options.devServer`
  is patched to mount `createInspectorMiddleware` via
  `setupMiddlewares`, composing with (never replacing) whatever you already
  configured there. Works with `webpack-dev-server` and Rspack's dev server —
  both accept the same `setupMiddlewares(middlewares, ctx) => middlewares`
  shape.
- **Watch mode / source maps** — both bundlers re-run the loader for changed
  files automatically; the shared transform's own content-hash-keyed cache
  means a changed file simply produces a fresh cache entry.

It does **not** inject anything into an HTML page — that's `html-webpack-plugin`'s
job, not this plugin's, and it's out of scope here the same way esbuild's
adapter leaves it to the application/build script.

## Divergences from the Vite/Rollup/esbuild adapters

All forced by webpack's/Rspack's own architecture, not by choice:

- **No in-memory virtual modules.** Neither bundler has a `resolveId`/`load`
  or `onResolve`/`onLoad` equivalent (Rspack's Rust-side resolver hook can only
  *redirect* an existing request, not serve new in-memory content), so the
  runtime/overlay bootstrap source is written to real files under the
  project's own `node_modules/.cache/mithril-inspector` and wired in via
  `resolve.alias`.
- **A colon-free virtual specifier.** Every other adapter's shared
  `virtual:mithril-inspector/runtime` specifier is unusable here: webpack (and
  Rspack, which follows the same convention) treats any `scheme:...`-shaped
  request as a URI and rejects it with `UnhandledSchemeError` *before*
  `resolve.alias` ever runs — confirmed empirically against a real build, not
  just from documentation. This adapter uses `mithril-inspector/virtual-runtime`
  / `mithril-inspector/virtual-overlay` instead — relevant only if you use the
  manual-import escape hatch below; the auto-wired path never needs you to
  write the specifier yourself.
- **`EntryPlugin`, not `compiler.options.entry` mutation.** Rspack's docs
  explicitly forbid mutating `entry` once the compiler is constructed (webpack
  itself has no such documented restriction, but the same mechanism works on
  both, so this adapter uses it universally rather than branching).
  `resolveEntryNames` reads (never mutates) the configured entry to find which
  named entries to target; a **dynamic (function) entry** can't be
  auto-injected into — this is logged with `console.warn`, not silently
  dropped, and the manual-import fallback below still works.
- **Best-effort HMR only.** The shared bootstrap's invalidation channel is
  wired through Vite's `import.meta.hot`, which webpack/Rspack never populate
  (`module.hot` is their own, differently-shaped API) — it safely evaluates to
  inactive rather than erroring, but stale-module invalidation on module
  replacement does not happen automatically here.

## Dev-only guard

Active only when `enabled` (default: `NODE_ENV !== "production"`) **and**
`compiler.options.mode !== "production"`, unless `includeInProduction` is set
— mirroring the esbuild adapter's `minify`-as-production-signal, since both
webpack and Rspack expose `mode` directly:

```ts
mithrilInspector({
  includeInProduction: true, // force it into a production-mode build too
})
```

## Mounting the overlay manually

The auto-injected entry (above) is enough for most setups. If you need to
control exactly where the overlay mounts instead (or your entry is a dynamic
function the plugin couldn't auto-inject into), import it yourself using the
webpack-safe specifier from the divergences section:

```ts
if (process.env.NODE_ENV !== "production") {
  import("mithril-inspector/virtual-overlay")
}
```

## Options

Same shape as `@mithril-inspector/vite` — see that package's README
for the full option reference (`include`/`exclude`, `root`/`projectRoots`,
`editor`, `pathMappings`, `mode`, `ui`, `picker`, `componentTree`, `source`,
`mithrilImports`/`hyperscriptIdentifiers`, `debug`, `redact`).
