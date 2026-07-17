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
        position: "bottom-right",
        theme: "system",
      },
    }),
  ],
})
```

Run `pnpm dev`, open the app, click the collapsed "Mithril Inspect" tab, then
the element-picker button, and hover an element to see its owning component
and exact TypeScript source line (`SaveButton` / `button.btn.primary` /
`src/components/SaveButton.ts:28:7`). Click it to select without triggering
the app's own click handler, then "Open in editor" to jump straight to that
line in VS Code.

The plugin is dev-only by default (`enabled` follows `NODE_ENV`) and adds no
runtime, overlay or editor endpoint to production builds (§20.1.12).

## Status: 0.1.0-alpha.1 (Phase 1 — source inspector)

This is the first publishable alpha (REQUIREMENTS.md §21 Phase 1): AST source
instrumentation, the runtime source registry, DOM/source association, the
picker, highlight, source tooltip, the Vite editor middleware and the
collapsed bottom tab. See `TASKS/0016-mvp-acceptance-alpha-release.md` for the
full acceptance checklist and `CHANGELOG.md` for release notes and known
limitations.

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
