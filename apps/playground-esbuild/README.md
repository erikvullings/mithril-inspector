# esbuild playground

The manual test bed for `@mithril-inspector/esbuild` (task 0024): a small
Mithril 2.x + TypeScript app built
with a plain `esbuild.context()`/`.watch()` script rather than a framework CLI
— esbuild has no dev-server/HTML-injection hooks of its own, so
`scripts/dev.mjs` wires up the plugin's `devServer` option to reuse
`@mithril-inspector/server`'s open-in-editor middleware at the same origin as
the static output (see `packages/esbuild/README.md`).

## Run it

```sh
pnpm install
pnpm --filter @mithril-inspector/playground-esbuild dev
```

This builds `src/main.ts` into `dist/main.js`, watches for changes, and
starts the helper dev server — it prints the URL to open, e.g.:

```text
[mithril-inspector] open-in-editor endpoint ready: http://127.0.0.1:5xxxx
```

Open that URL. You should see:

1. A collapsed **◇ Mithril Inspect** tab near the bottom-right (mounted via a
   guarded `import("virtual:mithril-inspector/overlay")` at the bottom of
   `src/main.ts` — esbuild has no HTML-transform hook to inject it for you,
   unlike Vite/Rollup's documented alternative of adding this same guarded
   import yourself).
2. Click it to expand the panel, then **Select element** to activate the
   picker.
3. Hover the "Increment" button, an item in the list, or the greeting heading
   — a badge shows the component name, tag, and `src/main.ts:line:col`.
4. Click it: the button's own `onclick` is suppressed (the counter does *not*
   increment), and the panel shows the selected component/source instead.
5. Click **Open in editor** — `scripts/dev.mjs` configures `editor: "code"`,
   so this opens VS Code at the exact original `.ts` line. Edit that value
   (or set `MITHRIL_INSPECTOR_EDITOR`/`EDITOR` and remove the hardcoded
   `editor` option) to use a different editor.

## What's in `src/main.ts`

A tiny app covering three of the component forms (§6.5) the transform
supports: `Greeting` (**object**), `Counter` (**closure**, with a real
`onclick` — useful for manually confirming picker clicks are suppressed) and
`ItemList` (**closure**, a keyed list).

## Production build is inspector-free

```sh
pnpm --filter @mithril-inspector/playground-esbuild build
grep -r "__MITHRIL_INSPECTOR__\|__miRegisterModule\|__miSource\|mountInspectorOverlay\|virtual:mithril-inspector\|open-in-editor" dist
# no matches
```

`scripts/build.mjs` deliberately still wires the plugin up (unlike simply
omitting it) with `minify: true` and no `includeInProduction` — proving the
plugin's own dev-only/minify guard does the exclusion (§12.4 AC), not just
the absence of the plugin from the script. The `if (__DEV__) { ... }` guard
around the overlay import in `main.ts` is dead-code-eliminated by esbuild once
`define: { __DEV__: "false" }` makes the condition statically `false`, so the
unresolvable `virtual:mithril-inspector/overlay` specifier never reaches
esbuild's resolver in a build where the plugin isn't active to serve it.

## No HMR (documented limitation, §25.9)

Plain esbuild watch mode has no fine-grained module replacement — every
change is a full rebuild, and the browser tab needs a manual reload to see
it (there is no HMR client/websocket wired up here). Source mappings stay
correct after a reload. This mirrors the Implementation Notes in
`TASKS/0024-esbuild-adapter.md`: the HMR mapping-invalidation logic from task
0007 has nothing to invalidate against without a real HMR transport, so it
does not apply to this adapter.
