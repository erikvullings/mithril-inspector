# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/); pre-1.0 versions may include
breaking changes between minor releases.

## 0.3.1 — Editor-launch failures no longer fail silently

### Fixed

- **Every "open in editor" failure now surfaces somewhere** (§16). Several
  overlay-side paths (no resolvable source location for the selection/hover,
  a stale component, an unmapped DOM node) recorded an internal diagnostic
  but never `console.warn`'d, unlike every other failure in the same flow —
  a click that was supposed to jump to the editor could fail with zero
  visible feedback. All of them now route through a shared
  `recordEditorFailure` helper in `@mithril-inspector/overlay`'s controller,
  so every failure is both recorded and warned.
- **A terminal-only resolved editor (`vi`, `vim`, `nvim`, `emacs`, `nano`,
  `pico`, `ed`) is now flagged instead of failing silently.** `spawnEditorProcess`
  always launches the editor detached with `stdio: "ignore"` and no TTY — a
  terminal editor starts and exits without ever visibly opening, while the
  endpoint still reports success (the OS process did start). This is easy to
  hit by accident: with no explicit `editor` option, resolution falls back to
  `MITHRIL_INSPECTOR_EDITOR`/`LAUNCH_EDITOR`/`VISUAL`/`EDITOR` from the dev
  server's own environment before defaulting to `"code"`, and a shell
  profile's ambient `$EDITOR` (often `vi`) silently wins with no error at any
  layer. `@mithril-inspector/server` exports a new `isTerminalOnlyEditor`
  check; `@mithril-inspector/adapter-kit` now warns once at dev-server
  startup when the resolved editor matches it, and the overlay's Settings
  tab flags it inline next to the read-only "Opens in …" display.
- Documented the pitfall and the terminal-editor limitation in the root
  README and every bundler adapter's README, recommending an explicit
  `editor` option instead of relying on the environment-variable fallback.

## 0.2.0 — Phase 4: Rollup, esbuild and webpack/Rspack adapters; diagnostics

Builds on 0.1.0 with everything from REQUIREMENTS.md §21 Phase 4 (the
remaining bundler adapters) plus the render-timing/redraw-flash slice of
Phase 5. See each task file under `TASKS/` for full acceptance criteria and
Agent Notes.

### Added

- **Rollup adapter** (§12.3, task 0023) — `@mithril-inspector/rollup`, a thin
  adapter over the shared transform/runtime/server packages: AST
  transformation, virtual-module resolution, watch mode and source maps,
  dev-only by default. Extracted `@mithril-inspector/adapter-kit`
  (bundler-neutral option resolution and virtual-module utilities) out of the
  Vite plugin so Rollup, esbuild and webpack share it instead of duplicating
  it.
- **esbuild adapter** (§12.4, task 0024) — `@mithril-inspector/esbuild`,
  built on `build.onResolve`/`build.onLoad`/`build.onEnd`. esbuild has
  neither an HTML-injection hook nor a dev-server hook, so it ships an
  opt-in `devServer` option that starts a small combined static-file and
  editor-endpoint server reusing `@mithril-inspector/server`. Added
  `apps/playground-esbuild`, demonstrating picker → open-in-editor
  end-to-end.
- **Webpack/Rspack adapter** (§12.5, task 0025) — one
  `@mithril-inspector/webpack` plugin that runs unmodified on both: an
  `enforce: "pre"` loader for transformation, `EntryPlugin`-based entry
  injection, and `devServer.setupMiddlewares` wiring for the open-in-editor
  endpoint. Both bundlers reject `virtual:...`-shaped specifiers before
  `resolve.alias` runs, so this adapter writes the runtime/overlay bootstrap
  to real files under `node_modules/.cache/mithril-inspector` instead of an
  in-memory virtual module — verified against real `webpack()` and
  `rspack()` builds.
- **Render-timing tracking and slow-render warnings** (§17, task 0029) —
  per-component last-render-duration tracking and an opt-in slow-render
  warning, off by default.
- **Redraw-flash visualization** (§17, task 0030) — an opt-in, rAF-throttled
  visual flash on DOM nodes that actually changed on a redraw (not every
  component whose `view()` ran), plus a live Settings-tab toggle
  (`mode: "full"`-gated) that re-reads mode/enabled state on every mutation
  batch so mode transitions and toggling take effect immediately.
- **Attrs in the History timeline** (task 0027 follow-up) — the History tab
  (renamed from "State History") now interleaves attrs alongside state, with
  a Both/State/Attrs scope toggle once a component has data in both, and
  drops whichever side is always empty instead of showing bare
  `(value): Object` noise.
- **Vite 8 support** — the playground and `@mithril-inspector/vite`'s peer
  range widened to include `^8.0.0`; `mithrilInspector()` now returns
  `PluginOption[]` instead of `Plugin[]` so consumer projects on a different
  Vite version than this repo's devDependency don't hit `TS2769` import
  errors.

### Fixed

- Normalized `sourcesContent` in source maps across all bundler adapters —
  `magic-string` produces `(string | null)[]` but bundlers expect
  `string[]`.
- Redraw-flash: the `MutationObserver` install decision was frozen at mount
  time, so a session that transitioned into `mode: "full"` later never got
  the observer attached; toggling the Settings-tab checkbox off also didn't
  cancel an already-in-flight flash.

### Packaging

- `adapter-kit`, `rollup`, `esbuild` and `webpack` join the four 0.1.0
  packages as public packages, versioned in lockstep — all ten shipping
  packages (`protocol`, `runtime`, `transform`, `server`, `overlay`,
  `adapter-kit`, `vite`, `rollup`, `esbuild`, `webpack`) are `0.2.0`.

## 0.1.0 — Phase 2/3: component tracking, ancestry, safe previews, state history

Builds on 0.1.0-alpha.1 with everything from REQUIREMENTS.md §21 Phases 2 and
3, plus a Meiosis-inspired state history panel. See each task file under
`TASKS/` for full acceptance criteria and Agent Notes.

### Added

- **Component-instance tracking** (§7.3, §17, task 0017) — the runtime now
  tracks mounted component instances (`ComponentRecord`: parent/child links,
  `mounted`, `createdAt`/`updatedAt`/`updateCount`, `domRange`, `key`) for
  object, closure, class and route-resolver components, gated by
  `mode: "components" | "full"` (class/route-resolver) or unconditional
  (object/closure, carried forward from the alpha). See
  `packages/runtime/README.md` for the per-kind tracking mechanism and its
  documented limitation (bare `function` declarations are untrackable at the
  instance level).
- **Display name resolution** (§9.2, task 0018) — a strict seven-tier
  fallback (explicit inspector name → `displayName` → discovered
  variable/export name → class name → function name → filename-derived →
  `"Anonymous"`), with `displayNameInferred` distinguishing an authoritative
  name from a guess.
- **Component ancestry panel and "Reveal component"** (§9.3, task 0019) — a
  full root-first ancestor chain (not just nearest-component) plus a
  multi-target "Open in editor" chooser (declaration / component-view /
  rendered element).
- **Safe serializer and redaction** (§7.4, §15, task 0020) — a lazy,
  paginated, privacy-aware `PreviewNode` tree for attrs/state: getters
  evaluated only on demand, large containers paged instead of dumped, keys
  matching a redaction pattern (password, token, secret, etc.) never read at
  all.
- **Batched runtime tree events** (§9.4, task 0021) — `subscribe()` now
  delivers coalesced `components-added`/`components-updated`/
  `components-removed`/`dom-associated`/`reset` events once per flush instead
  of once per changed record.
- **Full component tree UI** (§9, task 0022) — the overlay's Components tab
  gained an expandable Mithril component tree (not a DOM tree) with two-way
  selection sync, search, per-component update counters, and attrs/state
  panels backed by the lazy preview tree.
- **State History tab** (task 0027, polished in task 0028) — a read-only
  timeline of a watched component's state, one entry per redraw, seeded with
  the component's current state immediately on selection. Newest-first list,
  a diff panel that expands container-valued (object/array) changes into an
  aligned before/after view instead of a bare `summarize() → summarize()`,
  and auto-follow that keeps tracking the latest snapshot unless the user
  explicitly pins an older one.

### Packaging

- Dropped the `-alpha.1` suffix; `protocol`, `runtime`, `transform`, `server`,
  `overlay` and `vite` are versioned `0.1.0` and no longer `"private"`, with
  npm publish metadata (`description`, `license`, `repository`, `keywords`,
  `publishConfig`) and a `prepublishOnly` build step added to each.
- Added `scripts/release.mjs` (`pnpm release <patch|minor|major|<version>>`)
  to bump all shipping packages in lockstep, run the CI gate, commit, tag and
  publish.

## 0.1.0-alpha.1 — Phase 1 source inspector

REQUIREMENTS.md §21 Phase 1: the first publishable alpha. Covers all 15 MVP
acceptance criteria (§20.1) — see `TASKS/0016-mvp-acceptance-alpha-release.md`
Agent Notes for the full checklist with test evidence.

### Added

- `@mithril-inspector/protocol` — shared serializable types and constants, no
  bundler dependencies.
- `@mithril-inspector/transform` — bundler-neutral AST source instrumentation
  for object, closure, class and function components, standard `m(...)` calls
  and experimental JSX/TSX; source maps verified back to original TypeScript
  through a real esbuild compile.
- `@mithril-inspector/runtime` — the source registry, component registry,
  DOM/source association and lifecycle-hook composition, HMR-safe across
  module re-registration.
- `@mithril-inspector/overlay` — the in-page inspector UI (Mithril-based):
  collapsed bottom tab, element picker, highlight overlay, source tooltip,
  selected-element panel and a basic (nearest-component) ancestry view.
- `@mithril-inspector/server` — the open-in-editor middleware: path-traversal
  and command-injection prevention, VS Code / VS Code Insiders / custom editor
  support, monorepo project-root and remote path-mapping support.
- `@mithril-inspector/vite` — the zero-config Vite plugin combining the above;
  development-only by default, fully excluded from production builds.
- A real Vite playground app (`apps/playground-vite`) and a Puppeteer-driven
  headless-Chromium browser test suite (`tests/browser`, `pnpm test:browser`)
  exercising all ten §19.2 browser assertions end-to-end.

### Known limitations (Phase 1)

- **Component ancestry is nearest-component only.** The full expandable,
  multi-level ancestry chain arrives with component-instance tracking (0017)
  and the ancestry panel (0019).
- **Class and standalone `function` component declarations** are registered
  for display-name resolution and source-level picking, but are not
  lifecycle-wrapped/instance-tracked in Phase 1 — object and closure
  components are fully instrumented. See `packages/runtime/README.md`.
- **A native `<dialog>` opened via `showModal()` blocks the overlay** while
  open (browser top-layer/inert semantics); the overlay detects this and
  records a `modal-dialog` diagnostic rather than failing silently. See
  `packages/overlay/README.md` and `apps/playground-vite/README.md`.
- **`mode` (`source` / `components` / `full`) is scaffolding** — accepted but
  does not yet gate behavior differently.
- **CI exercises a single pinned Vite version** (`^7.3.6`); the plugin's
  declared peer range (`^5 || ^6 || ^7`) is not yet matrix-tested. Firefox and
  Safari are noted placeholders in the compatibility matrix (§19.3); only
  Chromium runs in CI today.
- **Tested against one nontrivial Mithril application** (the playground).
  §20.2's "two nontrivial Mithril applications" quality-gate item gates the
  STABLE release, not this alpha, and has not started.

### Packaging

- Versions are set to `0.1.0-alpha.1` and each shipping package (`protocol`,
  `transform`, `runtime`, `overlay`, `server`, `vite`) pack-verifies cleanly
  with `pnpm pack` (workspace dependency ranges resolve to pinned versions in
  the packed `package.json`). Packages remain `"private": true` and are **not
  published** — this is a prepared, not a published, release.
