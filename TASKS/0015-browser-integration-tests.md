# 0015 Browser integration tests

Status: done
Priority: high
Owner: unassigned
Agent: claude-sonnet
Area: testing
Depends on: 0014

## Context
REQUIREMENTS.md §19.2: automated browser tests against fixture apps, using the available browser testing capability or the `browser-tools` skill (Chrome DevTools Protocol) — Playwright not required if existing tooling suffices. These tests gate every milestone (§25.6).

## Acceptance Criteria
Automated verification of the ten §19.2 assertions:
1. the inspector tab appears;
2. picker mode activates;
3. hover displays the correct component;
4. click selects the correct source;
5. the editor endpoint receives the expected file and line (mock the launcher, assert the request);
6. component ancestry is correct (extend once 0019 lands — mark pending until then);
7. redraws update mappings;
8. removed nodes are not selectable;
9. overlay interactions do not trigger application click handlers;
10. production build contains no inspector runtime.
- Tests run headless in CI via a single `pnpm test:browser` command and are stable (no flaky sleeps; wait on conditions).
- Fixtures cover keyed reordering, fragment roots, multiple mount roots, and HMR (§19.2 list) — reuse playground scenes or dedicated `tests/browser/` fixtures.

## Implementation Notes
- Compatibility targets (§19.3): Chromium now; Firefox once supported; Safari best-effort; Mithril 2.x current, Vite current two majors, Node active LTS. Encode the matrix in CI config even if only Chromium runs initially.
- Editor launches must be mocked at the server boundary — never spawn a real editor in CI.

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
- 2026-07-17: claude-sonnet implemented the suite.
  - **0014 dependency**: the Vite playground (0014) is still an unbuilt placeholder README, so this used the acceptance criteria's explicit fallback — dedicated fixtures under `tests/browser/fixtures/app/` — rather than blocking on it.
  - **Tooling**: added a new private workspace package `tests/browser` (`@mithril-inspector/browser-tests`) using Puppeteer (confirmed with the user over Playwright/raw-CDP) driving real, in-process `vite.createServer`/`build`/`preview()` instances — no CLI subprocess, no mocked Vite internals. The `browser-tools` skill referenced in the task's Context is a personal, interactive CDP tool outside the repo (built on Puppeteer itself) and isn't something a CI job elsewhere could invoke, so it wasn't used directly; Puppeteer is the same underlying capability, wired as a real repo dependency instead.
  - **Editor mocking**: `editor` is set to a `CustomEditorOption` pointing at `fixtures/editor-stub.mjs`, a tiny script that records its `{file,line,column}` argv to a result file instead of opening anything. Deliberately did *not* mock `node:child_process` globally, since that would also intercept Vite/esbuild's own internal process spawning in the same in-process test run.
  - **All 10 §19.2 assertions** verified (one file per assertion, `src/*.test.ts`), plus the HMR fixture scenario. Assertion 6 (ancestry) only checks the nearest owning component per the overlay's current Phase 1 behavior; a `.todo` documents the full multi-level ancestry chain as blocked on 0019.
  - **HMR finding**: Mithril has no HMR-integration plugin. An initial fixture design tried a self-accepting leaf module (`import.meta.hot.accept()` in `Hmr.ts`) hoping to hot-swap in place, but since no ancestor up to `main.ts` also accepts, the self-accept just silently absorbed the update with no visible effect (neither a swap nor Vite's normal reload propagation). Removed it; the fixture now relies on Vite's real default fallback (a full reload propagates all the way up), and `hmr.test.ts` asserts the reloaded page's content and source mapping are accurate — the honest, representative HMR event for a plain Mithril app.
  - **Fixture-authoring finding**: `Counter`/`ListScene` were initially written as `export function X() {...}` (bare function declarations). The transform only registers those for display-name resolution, not full lifecycle-wrapping/instance-tracking (matches `packages/runtime/README.md`'s "Known Phase 1 limitations" — confirmed empirically via `hook.getSnapshot()`, which showed no tracked instance for either). Rewrote both as `const X = () => {...}` closures, which are fully instrumented.
  - **pnpm strict linking**: the virtual overlay/runtime modules import `@mithril-inspector/overlay`/`runtime`/etc. by bare specifier; resolving them from a fixture copy required adding those packages as direct `dependencies` of `tests/browser` (not just `@mithril-inspector/vite`), otherwise pnpm's strict node_modules can't resolve vite's own transitive deps from a sibling package.
  - Added `.github/workflows/ci.yml`: Node `lts/-1`/`lts/*` matrix (§19.3) and a `browser: [chromium]` matrix dimension with Firefox/Safari noted as not-yet-wired placeholders, run via `pnpm build && pnpm typecheck && pnpm test && pnpm test:browser`. **Known gap**: did not add a Vite-major-version matrix dimension (the plugin's peer range is `^5 || ^6 || ^7`); only the pinned `vite@^7.3.6` devDependency is actually exercised. Flagging rather than half-implementing a multi-version install matrix, which felt like a distinct, larger effort than this task's scope.
  - Verified: 18 new tests + 1 `it.todo` across 9 files in `tests/browser/src/*.test.ts`, via `pnpm test:browser` (also `vitest run` directly in the package) — run 3 times consecutively with no flakiness. `tsc -p tsconfig.json --noEmit` clean for the new package. Full workspace `pnpm -r typecheck` and `pnpm -r test` (packages + spikes + this suite) pass with no regressions.
