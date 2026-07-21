# Mithril Inspector

Developer tooling for inspecting Mithril.js applications.

## Jumping to the source location

<img width="1395" height="767" alt="image" src="https://github.com/user-attachments/assets/98951fbf-4b7b-437a-939d-2ba6f433f18a" />

## Examining state or attribute changes

<img width="1395" height="767" alt="image" src="https://github.com/user-attachments/assets/90836c39-b035-4fa6-96d4-50fd22be9ced" />

## Quick start (§24)

Install the Vite plugin as a dev dependency:

```sh
pnpm add -D @mithril-inspector/vite
```

Add it to `vite.config.ts` — no other application-code changes are required
(§2.2):

```ts
import { defineConfig } from "vite"
import { mithrilInspector } from "@mithril-inspector/vite"

export default defineConfig({
  plugins: [
    mithrilInspector({
      editor: "code",
      mode: "full",
      ui: {
        theme: "system",
      },
    }),
  ],
})
```

Run `pnpm dev`, open the app, hover the unobtrusive "M" toggle at the bottom
of the page and click its target/crosshair icon to start picking (or open the
docked panel first via the "M" itself), then hover an element to see its
owning component and exact TypeScript source line (`SaveButton` /
`button.btn.primary` / `src/components/SaveButton.ts:28:7`). Click it to
select without triggering the app's own click handler — the result shows in
the docked panel's tree/detail view in place — then use the "Open in editor"
icon to jump straight to that line in VS Code.

### Shortcuts (§8.4, §8.7)

| Action | Default | What it does |
| --- | --- | --- |
| Toggle picking | `Alt+Shift+M` | Turns picking on/off — sticky, stays on after you release the keys. |
| Hold to pick | `Alt` | Picking is active only while held; release to stop. |
| Open in editor | `Enter` | Opens the current hover/selection's source while picking. |
| Cancel | `Escape` | Stops picking. |
| Open editor on click | `Meta` (Cmd/Win) | Hold while clicking during picking to select the element *and* jump straight to its source, skipping the toolbar's "Open in editor" step. |
| Pass-through | `Alt+Shift` | Hold while clicking during picking to let the click reach the app underneath instead of selecting — for interacting with the real page without leaving picking mode. |

Every shortcut is rebindable, or can be disabled entirely, from the overlay's
Settings tab — changes apply immediately and persist across reloads. Not
`Ctrl` for either click modifier: macOS intercepts `Ctrl`+click as a secondary
click (opening the native context menu) before it ever reaches the page.

The plugin is dev-only by default (`enabled` follows `NODE_ENV`) and adds no
runtime, overlay or editor endpoint to production builds (§20.1.12).

## Other bundlers

`@mithril-inspector/rollup` (§12.3, task 0023) is a thin Rollup adapter over
the same transform/runtime — AST transformation, virtual runtime/overlay
module resolution, watch mode and source maps, dev-only by default (active
only in `rollup --watch`/`rollup.watch()` unless `includeInProduction`).
Rollup has no HTML-injection or dev-server hooks, so overlay mounting and
editor launching need one extra step each — see `packages/rollup/README.md`.

`@mithril-inspector/esbuild` (§12.4, task 0024) is the same adapter built on
`build.onResolve`/`build.onLoad`/`build.onEnd` — dev-only by default (active
unless `NODE_ENV=production` or the build is `minify`d, unless
`includeInProduction`). esbuild has no HTML-injection hook either, and no
dev-server hook to hang the open-in-editor endpoint on, so it ships an opt-in
`devServer` option that starts a small combined static-file + editor-endpoint
server reusing `@mithril-inspector/server` — see `packages/esbuild/README.md`
and `apps/playground-esbuild` for a working example.

`@mithril-inspector/webpack` (§12.5, task 0025) is one plugin that runs
unmodified on both webpack and Rspack — a loader (`enforce: "pre"`) for
transformation, `EntryPlugin`-based entry injection for the runtime/overlay
bootstrap, and `devServer.setupMiddlewares` wiring for the open-in-editor
endpoint. Dev-only by default (active unless `compiler.options.mode ===
"production"`, unless `includeInProduction`). Because both bundlers treat any
`scheme:...`-shaped specifier as a URI and reject `virtual:mithril-inspector/*`
before `resolve.alias` ever runs, this adapter uses a colon-free specifier and
writes the runtime/overlay bootstrap to real files under
`node_modules/.cache/mithril-inspector` instead of an in-memory virtual module
— see `packages/webpack/README.md` for this and the other webpack/Rspack
divergences, all verified against real `webpack()` and `rspack()` builds in
`tests/integration/`.

## Status: 0.1.0 (Phase 1–3 — source inspector, component tracking, state history)

Beyond the 0.1.0-alpha.1 source inspector (AST source instrumentation, the
runtime source registry, DOM/source association, the picker, highlight,
source tooltip and the Vite editor middleware), this release adds
component-instance tracking with a full ancestry chain, a lazy/redacted
attrs-state preview tree, an expandable component tree UI, and a read-only
State History tab. See `CHANGELOG.md` for the full list and known
limitations, and `TASKS/0016-mvp-acceptance-alpha-release.md` for the
original alpha acceptance checklist.

REQUIREMENTS.md §20.2's quality gate for an initial **stable** release
requires testing against at least two nontrivial Mithril applications; only
the `apps/playground-vite` playground has been exercised so far.

## Development

This repository is a pnpm workspace. Install dependencies and run the package-level checks from the repository root:

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm test:browser
```

The packages under `packages/` are strict TypeScript, modern ESM modules. Playground applications live under `apps/`, while shared fixtures and integration suites live under `tests/`. Technical spikes are private workspace packages under `tests/fixtures/spikes/`; the decisions they validate are recorded in `docs/adr/`.

## Testing a package locally before it's on npm

None of the `@mithril-inspector/*` packages are on the npm registry until you
run `pnpm release` (below), so a consumer project can't just `pnpm add
@mithril-inspector/webpack` yet. Every adapter (`vite`, `rollup`, `esbuild`,
`webpack`) depends on the same six shared packages —
`adapter-kit`, `overlay`, `protocol`, `runtime`, `server`, `transform` — so
whichever approach you use, that's the full set you need to make available
locally alongside the adapter itself. Build first, either way:

```sh
pnpm build   # dist/ is what every package's package.json "exports" points to
```

### Fast iteration loop: `pnpm link`

Best while you're still actively changing this repo's code — a linked
package is a symlink, so a rebuild here (`pnpm --filter @mithril-inspector/webpack build`,
or a filtered `pnpm dev`/watch if you set one up) is picked up by the
consumer project immediately, no re-linking needed. It does **not** validate
what actually ends up in the published tarball (the `files` allow-list,
missing `dependencies`, etc.) — use the tarball approach below before you
actually cut a release. pnpm v11 removed `pnpm link --global`; link the
package directories into the consumer by path instead.

```sh
# in the consumer (Vite/Rspack/etc.) project
MI_REPO=/absolute/path/to/mithril-inspector
for pkg in vite adapter-kit overlay protocol runtime server transform; do
  pnpm link "$MI_REPO/packages/$pkg"
done
```

You only need to link the *adapter* you're actually testing (swap `vite`
for `webpack`/`rollup`/`esbuild`) plus the six shared packages — always the same
six regardless of which adapter.

If the consumer project prints `[WARN] The "pnpm" field in package.json is no
longer read by pnpm`, that warning is about the consumer project's own
configuration, not these linked packages: move settings such as
`pnpm.overrides` into the consumer root's `pnpm-workspace.yaml`.

### Closest to a real install: `pnpm pack`

Packs each package the way `npm publish` would (respecting `files`, rewriting
`workspace:*` ranges in the packed `package.json` to the current local
version) and installs it from a tarball, which is the best pre-release sanity
check. Because the shared packages aren't on the registry either, pack **all
seven** and add all seven tarballs together so the consumer's resolver can
satisfy the cross-references without reaching the network for them:

```sh
# in this repo
mkdir -p /tmp/mi-tarballs
for pkg in webpack adapter-kit overlay protocol runtime server transform; do
  (cd "packages/$pkg" && pnpm pack --pack-destination /tmp/mi-tarballs)
done
```

```sh
# in the consumer project
pnpm add /tmp/mi-tarballs/mithril-inspector-webpack-*.tgz \
  /tmp/mi-tarballs/mithril-inspector-adapter-kit-*.tgz \
  /tmp/mi-tarballs/mithril-inspector-overlay-*.tgz \
  /tmp/mi-tarballs/mithril-inspector-protocol-*.tgz \
  /tmp/mi-tarballs/mithril-inspector-runtime-*.tgz \
  /tmp/mi-tarballs/mithril-inspector-server-*.tgz \
  /tmp/mi-tarballs/mithril-inspector-transform-*.tgz
```

Either way, the adapter's own peer dependency (`vite`, `rollup`, `esbuild`, or
`webpack`/`@rspack/core`) is **not** included — the consumer project keeps
using whichever one it already has installed, same as a real install. Wire
the plugin into that project's config exactly as documented in the package's
own README (`packages/webpack/README.md`, etc.) or the Quick start above for
Vite, then run the dev server and confirm the overlay's "M" toggle appears —
that's the fastest end-to-end signal the linked/packed packages actually
resolved correctly.

## Releasing

`scripts/release.mjs` bumps `protocol`, `runtime`, `transform`, `server`, `overlay`, `adapter-kit`, `vite`, `rollup`, `esbuild` and `webpack` to the same version, runs the CI gate, commits, tags and publishes each package with pnpm — run it from the repository root once the working tree is clean (commit or stash everything first):

```sh
pnpm release:dry-run       # sanity check only — prints current -> next, changes nothing
pnpm release <patch|minor|major|<version>>
```

`pnpm release patch` bumps `0.1.0` to `0.1.1`; an explicit version (e.g. `pnpm release 0.2.0`) is also accepted, and re-running it against an already-committed version just tags and publishes without an empty version-bump commit. The script:

1. refuses to run against a dirty working tree (dry runs are exempt);
2. writes the new version into all ten `package.json` files and refreshes `pnpm-lock.yaml`;
3. runs `pnpm -r build`, `pnpm -r typecheck` and `pnpm -r test` — the same gate CI runs;
4. commits the version bump, then tags `vX.Y.Z` (skipped if the tag already exists);
5. runs `pnpm publish --access public` for each package in dependency order (`protocol` first, `vite`/`rollup`/`esbuild`/`webpack` last), rewriting `workspace:*` ranges to the pinned version as it goes.

npm/pnpm prompts for a 2FA one-time password per package when the terminal is interactive — that's expected during step 5, just type the code each time. Nothing is pushed automatically: review the commit and tag, then `git push && git push origin vX.Y.Z` yourself.

`pnpm test:browser` runs the headless-Chromium integration suite in `tests/browser` (Puppeteer, no Playwright) against real, in-process Vite dev servers and a real production build — see `tests/browser/README.md`. It needs `pnpm build` to have run first, since it consumes the built `@mithril-inspector/vite` package like any other consumer.
