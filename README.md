# Mithril Inspector

Developer tooling for inspecting Mithril.js applications.

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

`pnpm test:browser` runs the headless-Chromium integration suite in `tests/browser` (Puppeteer, no Playwright) against real, in-process Vite dev servers and a real production build — see `tests/browser/README.md`. It needs `pnpm build` to have run first, since it consumes the built `@mithril-inspector/vite` package like any other consumer.
