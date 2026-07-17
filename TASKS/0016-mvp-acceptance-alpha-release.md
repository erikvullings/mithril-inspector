# 0016 MVP acceptance and 0.1.0-alpha.1 release

Status: done
Priority: high
Owner: unassigned
Agent: claude-sonnet
Area: release
Depends on: 0015

## Context
REQUIREMENTS.md §20.1 lists 15 MVP acceptance criteria; §21 Phase 1 ends with a publishable alpha (`0.1.0-alpha.1`). This task is the checkpoint: walk every criterion, close gaps, and prepare (not necessarily publish) the alpha.

## Acceptance Criteria
- All 15 items of §20.1 verified and checked off in this file's Agent Notes, each with evidence (test name or manual-verification note): install, config, tab, picker highlight, hover info, click suppression, open-in-editor at correct TS line, nested-element precision (own `m(...)` expression, not just component), fragment-root selection, basic ancestry view, HMR registry integrity, production exclusion, unchanged attrs/lifecycle, path-traversal + command-execution prevention, test coverage across transform/runtime/middleware/browser.
- Quality-gate items from §20.2 tracked: source maps verified against TS files; keyed-list redraw tests; fragment-root handling; lifecycle composition tests; editor-endpoint security tests. (The "two nontrivial Mithril applications" item gates the STABLE release, not the alpha — record status only.)
- Package versions set to `0.1.0-alpha.1`; changelog/README quick-start (§24 install + config snippet) written; `pnpm -r build && pnpm -r test` green.
- Repository left in a runnable state (§25.8); unsupported cases documented, not silently omitted (§25.9).

## Implementation Notes
- Note: §20.1.10 "basic component ancestry" — Phase 1 only needs the ancestry list from nearest-component lookup; the full tree is Phase 3. If ancestry requires 0017's instance tracking, either pull minimal ancestry forward or record the gap here and re-verify after 0019.
- Do not publish to npm without the user's go-ahead; "prepare" means tagged and pack-verified (`pnpm pack`).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
- 2026-07-17: claude-sonnet ran the checkpoint. Found on arrival: an uncommitted, already-passing modal-`<dialog>` diagnostic (overlay.ts/overlay.test.ts/READMEs) from an interrupted prior attempt at this task — verified it (3 new overlay tests, all green) and folded it into this task's commit as it directly serves §25.9. Everything else below was newly done this session.

  **§20.1 MVP acceptance criteria — all 15 verified:**
  1. Install `@mithril-inspector/vite` — `pnpm pack` succeeds for the package (see packaging note below); README "Quick start" documents `pnpm add -D`.
  2. `mithrilInspector()` in `vite.config.ts` — real usage in `apps/playground-vite/vite.config.ts`; `packages/vite/src/plugin.test.ts` (16 tests), `options.test.ts` (11 tests).
  3. Collapsed tab on dev server — `tests/browser/src/tab-picker.test.ts` "shows the collapsed inspector tab (assertion 1)".
  4. Picker highlights DOM — `tests/browser/src/tab-picker.test.ts` "activates picker mode..." (assertion 2); `packages/overlay/src/picker.test.ts` (12), `highlight.test.ts` (8).
  5. Hover shows tag/component/file/line — `tests/browser/src/hover-source.test.ts` (3 tests, incl. fragment-root and multi-root cases); `packages/overlay/src/element-info.test.ts` (6).
  6. Click selects without triggering app handler — `tests/browser/src/click-suppression.test.ts`; `tests/browser/src/selection.test.ts` (assertion 4).
  7. Open in editor at correct TS line — `tests/browser/src/editor-endpoint.test.ts` (2, mocked launcher, asserts file/line/column); `packages/server/src/handle-request.test.ts` (17); `packages/transform/src/sourcemap.test.ts` traces esbuild-compiled output back to exact original `.ts`/`.tsx` positions.
  8. Nested elements → own `m(...)` expression, not just the declaration — `packages/transform/src/transform.test.ts` "instruments nested same-line calls, arrays and keyed lists distinctly" (same-line siblings get distinct columns); confirmed end-to-end via sourcemap.test.ts.
  9. Fragment-root selection via any rendered node — `packages/runtime/src/components.test.ts` "reports the DOM range for element and fragment-root components"; `tests/browser/src/hover-source.test.ts` "hovering a fragment-root component's elements resolves each one correctly".
  10. Basic component ancestry — per this task's own Implementation Notes, minimal nearest-component-lookup instance tracking was already pulled forward into Phase 1 (0010/0012) rather than deferred to 0017: `packages/overlay/src/view.ts` renders a "Component ancestry" section from `resolveDomComponent`; `packages/runtime/src/components.test.ts` "resolves nested components innermost-first and links parent/child (§9.1)". **Documented gap, not silent**: only the nearest component is shown (no multi-level chain) until the ancestry panel (0019); `tests/browser/src/selection.test.ts` names this explicitly ("assertion 6, nearest-only").
  11. HMR doesn't permanently corrupt the registry — `packages/runtime/src/source-registry.test.ts` "replaces a module's source table wholesale on re-registration (HMR)", "bumps the module generation on every re-registration"; `packages/vite/src/hmr.test.ts`; `tests/browser/src/hmr.test.ts` (real Vite reload, mapping stays accurate); ADR-106.
  12. Production builds exclude overlay/runtime/editor endpoint — `packages/vite/src/build-exclusion.test.ts`; `tests/browser/src/production-build.test.ts` (real `vite build` + `preview()`, greps the served output for inspector markers, 4 tests).
  13. Attrs/lifecycle hooks not observably changed — `packages/runtime/src/components.test.ts` "invokes every application hook with `this === state` and preserves return values", "preserves `this`-accessed helper methods and does not add own state keys (§2.3)"; `packages/runtime/src/dom-association.test.ts` (no enumerable attr key added); spike ADR-105.
  14. Path traversal + command execution prevented — `packages/server/src/resolve-file.test.ts` (11: traversal, symlink escape, null byte, prefix-sharing sibling); `packages/server/src/launch-editor-process.test.ts` ("passes arguments as a literal array without shell interpretation"); `packages/server/src/handle-request.test.ts` (traversal/absolute-outside/nonexistent/directory rejections).
  15. Test coverage across transform/runtime/middleware/browser — transform 60, runtime 68, server 90, overlay 120, vite 58 (all via `vitest run` per package), browser 18 + 1 `.todo` via `pnpm test:browser`; plus 61 spike tests (0002–0007).

  **§20.2 quality gate:**
  - Source maps verified against TS files — `packages/transform/src/sourcemap.test.ts` (esbuild-chained, exact original positions).
  - Keyed-list redraws tested — `packages/transform/src/execute.test.ts` "preserves keyed-list output including keys"; `tests/browser/src/redraw-mapping.test.ts` (real shuffle, re-hover resolves the new occupant).
  - Fragment-root components handled — transform/runtime/overlay/browser, see criterion 9 above.
  - Lifecycle composition tested — `packages/runtime/src/components.test.ts` (package-level, not just the ADR-105 spike).
  - Editor-endpoint security tests — `packages/server` (90 tests, see criterion 14).
  - "Two nontrivial Mithril applications" — **not started, recorded per this task's own instruction that it gates STABLE, not the alpha.** Only `apps/playground-vite` has been exercised (real dev server + production build, in the browser suite); `apps/playground-esbuild` and `apps/test-fixtures` are still placeholder READMEs (esbuild adapter is task 0024, unimplemented).

  **Versions and packaging:** bumped `protocol`, `transform`, `runtime`, `overlay`, `server`, `vite` to `0.1.0-alpha.1` (the six packages that ship in the Phase-1 alpha per REQUIREMENTS.md §4/§21). Left `rollup`, `webpack`, `esbuild` at `0.0.0` — they are unimplemented placeholder scaffolds for §3.2 "Subsequent scope" (tasks 0023–0025), not part of this alpha; `apps/*` and `tests/browser` are private workspace-only and also left at `0.0.0`. Ran `pnpm pack --pack-destination` for all six shipping packages — all succeed, and the packed `package.json` for each correctly resolves `workspace:*` inter-package deps to the pinned `0.1.0-alpha.1` version. Packages remain `"private": true`; **not published** per this task's Implementation Notes (no npm publish without go-ahead). Tagged the release commit `v0.1.0-alpha.1` locally (not pushed).

  **Docs:** added a "Quick start" (§24 install + config snippet, copied from the real, currently-working plugin options) and a "Status" section to the root `README.md`; added `CHANGELOG.md` with the `0.1.0-alpha.1` entry, consolidating every "Known Phase 1 limitations" note already scattered across `packages/runtime/README.md`, `packages/overlay/README.md`, `apps/playground-vite/README.md` and 0015's CI notes, so §25.9 unsupported-case documentation is discoverable from one place. Fixed an unrelated stray unmatched closing code-fence at the end of `packages/runtime/README.md` (cosmetic, found while reading it for this task).

  **Verified:** `pnpm -r build && pnpm -r test` green (all packages, spikes and `tests/browser`, no regressions from the version bump or doc changes); `pnpm -r typecheck` clean. Did not re-run individual new test files since no new test files were added this session (only the pre-existing uncommitted overlay tests, already verified above); the full-suite run above is the complete, current count.

  **Repository state (§25.8):** runnable — `pnpm install && pnpm build && pnpm test && pnpm typecheck && pnpm test:browser` all succeed from a clean install.

- 2026-07-17 claude-sonnet: the gap recorded above in criterion 10 ("only the nearest component is shown, no multi-level chain") is now closed by task 0019 — the overlay's "Component ancestry" section shows the full root-first chain, and `tests/browser/src/selection.test.ts`'s `it.todo("full multi-level ancestry chain is reported (blocked on 0019)")` is now a real, passing test. See TASKS/0019-ancestry-panel.md for details.
