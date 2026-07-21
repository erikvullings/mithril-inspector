# @mithril-inspector/esbuild

The esbuild integration for Mithril Inspector. A
thin adapter over the shared transform (`@mithril-inspector/transform`) and
runtime (`@mithril-inspector/runtime`) — same option shape and instrumentation
behaviour as `@mithril-inspector/vite`/`@mithril-inspector/rollup`, reused via
`@mithril-inspector/adapter-kit` rather than reimplemented (§12.1, ADR-004).

## Usage

```ts
// build.mjs / esbuild config
import * as esbuild from "esbuild"
import { mithrilInspector } from "@mithril-inspector/esbuild"

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  sourcemap: true,
  plugins: [mithrilInspector()],
})
```

`mithrilInspector(options?)` returns a **single** esbuild `Plugin`, built from
`build.onResolve`/`build.onLoad`/`build.onEnd` (§12.4) — esbuild has no
`transform`-per-file hook like Rollup/Vite, so instrumentation happens in
`onLoad` instead, reading and transforming each matched file directly.

## What it does — and doesn't

- **AST transformation** — an `onLoad` hook filtered to `.js`/`.jsx`/`.ts`/`.tsx`
  (and their `.mjs`/`.cjs`/`.mts`/`.cts` variants) reads the file, calls the
  same `transformMithrilModule` every adapter uses, and returns the
  instrumented source with the right `loader` inferred from the extension.
  `@mithril-inspector/adapter-kit`'s `shouldAttemptTransform` short-circuits
  before ever touching disk for `node_modules` and the inspector's own
  packages.
- **Runtime import resolution** — an `onResolve` hook redirects
  `virtual:mithril-inspector/runtime`/`.../overlay` into a dedicated
  `mithril-inspector-virtual` namespace; a matching `onLoad` hook serves their
  generated source, which esbuild then bundles directly into whichever output
  chunk imports them (esbuild has no `\0`-prefix virtual-module convention —
  a plugin namespace is the idiomatic equivalent, §11.2 analog).
- **Watch mode** — `esbuild.context(...).watch()` re-runs `onLoad` for changed
  files automatically; the shared transform's own content-hash-keyed cache
  (§17) means a changed file simply produces a fresh cache entry.
- **Source maps** — esbuild's `onLoad` has no dedicated map field (unlike
  Rollup/Vite's `transform` hook), so the transform's map is appended as a
  `//# sourceMappingURL=data:application/json;...` comment, which esbuild's
  own source-map handling picks up and chains into the final output map.
- **Helper development server** (§12.4: "a helper development server *may* be
  provided") — the opt-in `devServer` option (below), reusing
  `@mithril-inspector/server`'s `createInspectorMiddleware`.

It does **not** inject anything into an HTML page — esbuild has no
`transformIndexHtml` equivalent — see "Mounting the overlay" below.

## Dev-only / minified-build guard (§2.1 analog)

Active only when `enabled` (default: `NODE_ENV !== "production"`) **and** the
build is not minified, unless `includeInProduction` is set:

```ts
mithrilInspector({
  includeInProduction: true, // force it into a minified/production build too
})
```

esbuild has no `command === "build"` distinction a plugin can read the way
Vite does, so `initialOptions.minify` is used as the production signal in
addition to `NODE_ENV` — a plain `esbuild --minify` run excludes inspector
code by default even without `NODE_ENV=production` set (§12.4 AC).

## Helper development server (§12.4)

esbuild's own `context().serve()` has no middleware hook to mount the
open-in-editor endpoint on, and it can't share an origin with a separately
started `startInspectorServer` (§10.2's no-CORS posture requires same-origin).
The `devServer` option solves both: it starts a small combined static-file +
open-in-editor server, lazily on the first completed build (wired through
`onEnd`), and stops it when the build context is disposed (`onDispose`):

```ts
mithrilInspector({
  editor: "code",
  devServer: { servedir: "public", port: 5178 }, // port optional, defaults to an ephemeral free port
})
```

Point your `<script src="...">` tags (and the browser) at that server instead
of esbuild's own `serve()` — it serves whatever is on disk under `servedir`
(so it works fine alongside `esbuild.context(...).watch()`, which just keeps
writing rebuilt output there) plus the `/__mithril-inspector/open-in-editor`
endpoint at the same origin.

The same server is also exported standalone, for a companion script that
doesn't want the plugin managing its lifecycle:

```ts
import { createEsbuildDevServer } from "@mithril-inspector/esbuild"

const handle = await createEsbuildDevServer({
  servedir: "public",
  inspector: { root: projectRoot, editor: "code" },
})
console.log(`Mithril Inspector: ${handle.url}`)
// ... later: await handle.close()
```

It binds to `127.0.0.1` only, matching `startInspectorServer`'s security
posture (§10.2). The other two patterns `@mithril-inspector/rollup` documents
— mounting `createInspectorMiddleware` in an existing dev server, or a
`startInspectorServer` companion behind your own reverse proxy — work here
too, unchanged.

## Mounting the overlay

Since esbuild has no HTML injection hook, pick one of two patterns:

1. **Guarded import in application code** (simplest — matches
   `@mithril-inspector/rollup`'s pattern):

   ```ts
   if (process.env.NODE_ENV !== "production") {
     import("virtual:mithril-inspector/overlay")
   }
   ```

2. **A dedicated entry point plus a manual `<script>` tag**, for zero
   application-code edits: add a second `entryPoints` file that only contains
   `import "virtual:mithril-inspector/overlay"`, build it to its own output
   (e.g. `dist/mithril-inspector-overlay.js`), and add
   `<script type="module" src="/mithril-inspector-overlay.js"></script>` to
   your HTML manually — omit that entry point (or the `<script>` tag) from
   production builds to keep them inspector-free.

## Options

Same shape as `@mithril-inspector/vite` (§11.1) plus the esbuild-specific
`devServer` option above — see that package's README for the full option
reference (`include`/`exclude`, `root`/`projectRoots`, `editor`,
`pathMappings`, `mode`, `ui`, `picker`, `componentTree`, `source`,
`mithrilImports`/`hyperscriptIdentifiers`, `debug`, `redact`).
