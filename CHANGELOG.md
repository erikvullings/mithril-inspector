# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/); pre-1.0 versions may include
breaking changes between minor releases.

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
