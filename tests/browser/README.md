# Browser tests

Automated, headless-Chromium verification of the ten §19.2 assertions (task
0015) using Puppeteer — no Playwright dependency, per the task's tooling note.
Real, in-process Vite dev servers (`vite.createServer`) and a real `vite
build` + `preview()` drive the fixture app; nothing is mocked except the
editor launcher.

```sh
pnpm build        # workspace packages must be built first (dist/ is what
                   # @mithril-inspector/vite etc. resolve to)
pnpm test:browser # from the repo root, or `pnpm test` inside this package
```

## Layout

- `fixtures/app/` — a small Mithril + TS app exercising: a simple mounted
  object component (`Greeting`), nested components (`Layout`), a keyed list
  with shuffle/remove controls (`ListScene`), a fragment-root component with
  no wrapping element (`FragmentScene`, ADR-104), a second independent
  `m.mount` root (`SecondRoot`), a component with a real click handler
  (`Counter`), and a component edited on disk by the HMR test (`Hmr.ts`).
  `Counter`/`ListScene` are written as `const X = () => {...}` — only that
  closure form is lifecycle-wrapped for instance tracking in Phase 1 (see
  `packages/runtime/README.md` "Known Phase 1 limitations"); a bare
  `function X() {...}` declaration is registered for display-name resolution
  only.
- `fixtures/editor-stub.mjs` — the "editor" every test launches: it records
  its `{file, line, column}` argv to a result file instead of opening
  anything. The launcher is mocked at the server boundary (a `CustomEditorOption`
  pointing at this script), never `node:child_process` itself, so Vite/esbuild's
  own process spawning is untouched.
- `src/harness/` — dev-server/build/browser/editor-stub plumbing, plus
  `scenario.ts`, which bundles "fresh fixture copy + dev server + browser +
  page" into one object each test file starts once in `beforeAll` and reuses
  across its `it()`s via `reload()` (a same-origin navigation, cheap and
  fully isolating — the overlay's persisted collapsed/offset `localStorage`
  state is cleared on every reload).
- `src/*.test.ts` — one file per §19.2 assertion (plus HMR): tab appears,
  picker activates, hover/click resolve the correct component and source
  (including the fragment-root and multiple-mount-root fixtures), the editor
  endpoint receives the exact file/line, the full multi-level component
  ancestry chain plus per-ancestor highlight/reveal-component (task 0019),
  keyed-reorder redraws update the DOM/source mapping, removed nodes report
  "no longer mounted", overlay interactions suppress the app's own click
  handler, and a real production build contains no inspector runtime.

## Notes

- The overlay mounts into an open shadow root (`#__mithril-inspector-host`);
  every overlay-side selector goes through Puppeteer's shadow-piercing
  `pierce/` query handler (`harness/browser.ts`'s `mi()` helper) rather than a
  bare CSS selector.
- Waits are condition-based throughout (`waitForFunction`/`waitForSelector`,
  or a bounded poll loop for the editor stub's result file) — no fixed
  sleeps.
- Mithril has no HMR-integration plugin, so editing a component with no
  `import.meta.hot.accept()` anywhere in its import chain (the fixture's
  default) makes Vite fall back to a full reload; that reload is the
  representative HMR event this app produces, and `hmr.test.ts` asserts the
  reloaded page's source mapping is accurate, not that no reload occurred.
- §19.3 compatibility matrix: only Chromium runs today (`.github/workflows/ci.yml`
  already encodes Firefox/Safari as placeholders per the task's implementation
  note, even though nothing wires them up yet).
