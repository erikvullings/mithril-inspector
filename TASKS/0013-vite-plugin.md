# 0013 Vite plugin

Status: done
Priority: high
Owner: unassigned
Agent: claude-opus
Area: vite
Depends on: 0007, 0009, 0010, 0011, 0012

## Context
REQUIREMENTS.md §4, §11: `@mithril-inspector/vite` combines transform, runtime injection, HTML injection and server middleware. Zero-config usage: `plugins: [mithrilInspector()]` — no app-code changes (§2.2). The adapter only integrates layers (§5); it must not duplicate transform or editor logic.

## Acceptance Criteria
- `mithrilInspector(options?: MithrilInspectorOptions): Plugin[]` implements the full options interface from §11.1 (enabled, includeInProduction, include/exclude, root(s), editor, pathMappings, ui.*, picker.*, componentTree.*, source.*, mithrilImports, hyperscriptIdentifiers, debug) plus `mode: "source" | "components" | "full"` (§17, §24).
- Dev-only by default: auto-disabled when `config.command === "build"` unless `includeInProduction` (§2.1); production bundles contain no runtime, overlay, or endpoint (§20.1.12) — verified by a build test.
- Hooks per §11.2: `configResolved` (root/filters/mode normalization), `resolveId`/`load` serving `virtual:mithril-inspector/runtime` and `.../overlay` with `\0`-prefixed resolved IDs, `transform` (instrument, preserve maps, skip node_modules/self/generated files, content+options cache), `transformIndexHtml` (inject overlay bootstrap — no entry-file edits), `configureServer` (editor endpoint + optional diagnostics), `handleHotUpdate` (invalidate metadata, push replacement records, preserve selection, drop stale registrations — per 0007 ADR).
- `enforce: "pre"` where transforms must see original TS/JSX; plugin split into pre/post parts if JSX cooperation requires it; intended order documented (§11.3).
- Optional `source.exposeDomAttributes` mode adds compact `data-mi="m17:s2"` attributes, no absolute paths, off by default (§13).
- Unit tests for option normalization, virtual module serving, build-mode exclusion, and transform filtering.

## Implementation Notes
- Returning a plugin array is explicitly allowed (§11.1).
- Privacy defaults (§15): component data never sent to the dev server; endpoint gets only file/line/column; default redaction key patterns wired through to runtime config.
- Debug logging gated behind `debug: true`, log-once semantics (§16).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
- 2026-07-17 claude-opus: Implemented `@mithril-inspector/vite` via TDD, one module per concern (§5: integrate layers, never duplicate transform/editor logic):
  - `options.ts` — public `MithrilInspectorOptions` (full §11.1 surface + `mode`, §17/§24, + an optional `redact` policy §15), `resolveInspectorOptions(options, env?)` applying dev-first defaults (`enabled = NODE_ENV !== "production"`, §2.1), and four derived builders: `toRuntimeBootstrapConfig` (mode/debug/exposeDomAttributes/redact only — never component data, §15), `toOverlayOptionsInput` (ui/picker → overlay), `toServerOptions` (root/projectRoots/editor/pathMappings, explicit `root` wins over the Vite root), `toTransformOptions` (points the injected import at `virtual:mithril-inspector/runtime`). `DEFAULT_REDACT_KEYS` is the §15 list.
  - `ids.ts` — the two public virtual specifiers and their `\0`-prefixed resolved ids.
  - `virtual-modules.ts` — `resolveVirtualId`, `runtimeModuleCode` (re-exports `registerModule`/`source`/`component` from the runtime and installs a configured runtime on the global hook once, plus the HMR `import.meta.hot.on` handler), `overlayModuleCode` (imports the runtime module first, then mounts the shadow-root overlay on DOM-ready, mount failures swallowed §16), `loadVirtualModule`.
  - `module-filter.ts` — `shouldAttemptTransform`: skips `\0` virtual modules, `node_modules`, and the inspector's own packages (which import Mithril themselves and must not be instrumented recursively).
  - `html.ts` — `overlayBootstrapTags({ dev, base })` + `devVirtualUrl`. **In dev** injects a `<script type="module" src="/@id/__x00__…">` (see the dev-server finding below); **in a forced production build** injects an inline `import "virtual:…"` so Rollup bundles it. Never edits the app entry file (§2.2).
  - `hmr.ts` — `HMR_INVALIDATE_EVENT` (`mithril-inspector:invalidate`), `normalizeFile`, and a file→moduleId registry so `handleHotUpdate` knows which module to invalidate (ADR-106).
  - `diagnostics.ts` — a tiny read-only diagnostics endpoint registered only in `debug` mode (§16), returns config status only, never app data (§15).
  - `plugin.ts` — `mithrilInspector(options?, env?)` returns a two-plugin array (§11.1): `mithril-inspector:pre` (`enforce: "pre"`, §11.3 — resolveId/load/transform/handleHotUpdate) and `mithril-inspector:serve` (transformIndexHtml/configureServer). Both carry an `apply` gate that disables them on `vite build` unless `includeInProduction` (§2.1).
- Cross-package additions required to wire the layers (each small, ADR/AC-motivated, each with its own runtime test in `config.test.ts`):
  - runtime `InspectorRuntime.invalidateModule(moduleId)` — surfaces the source-registry step ADR-106 says `handleHotUpdate` calls (was on the internal registry but not the hook).
  - runtime `RuntimeOptions.exposeDomAttributes` — implements §13: `source()` stamps a compact, path-free `data-mi="m:<hash>:sN"` on element vnodes only (fragment `[`/text `#`/trusted `<` skipped), off by default; the normal path still uses the WeakMap (§6.2).
  - runtime `RuntimeOptions.redact` + `getRedactionConfig()` — accepts/stores the §15 policy the adapter wires in (Phase-3 consumers read it; default `{ keys: [], replacement: "[redacted]" }`).
- JSX/plugin-order (§11.3): the transform handles JSX at the AST level (§6.6, JSXElement/JSXFragment), so `enforce: "pre"` (seeing original TS/JSX before esbuild lowers it) is sufficient — no separate post-transform plugin is needed. Documented in `packages/vite/README.md` and the plugin JSDoc.
- Finding (verified, not assumed): Vite does **not** rewrite a bare `import "virtual:…"` inside a transformIndexHtml-*injected* inline module script in dev — the browser would receive an unresolvable bare specifier and 404. A first draft used that form; the `dev-server.test.ts` integration test caught it. Fixed by injecting the `/@id/__x00__…` served URL in dev instead. The build path (only reachable with `includeInProduction`) keeps the inline-import form so Rollup can bundle it.
- Signature note: the public API is `mithrilInspector(options?)` (§11.1); a second optional `env` param (default `process.env`) is a non-breaking test seam so the `NODE_ENV` dev-default (§2.1) is deterministic in tests.
- Privacy (§15): endpoint receives only `{file,line,column}` (enforced in `@mithril-inspector/server`); the runtime bootstrap config carries redaction *policy*, never component data; nothing logs app data.
- Verified: 58 tests across 9 files in `packages/vite` (`options` 11, `virtual-modules` 9, `plugin` 16, `html` 4, `module-filter` 4, `hmr` 5, `index` 4, `build-exclusion` 1 real `vite build`, `dev-server` 4 real `createServer` — §20.1.12 build-clean + §11.2 pipeline), plus 9 new runtime tests in `config.test.ts` (68 runtime total). `pnpm -r typecheck` clean; full workspace `pnpm -r test` green (all 15 projects, zero failures). The real `vite build` test confirms production output contains no `virtual:mithril-inspector`, `__miRegisterModule`, `__miSource`, `mountInspectorOverlay`, `__mithril-inspector` or `open-in-editor` (§20.1.12).
- Known follow-ups (not gaps against this task's ACs): `source.{elements,components,attributes,textExpressions}` and `componentTree.{captureAttrs,captureState}` are normalized and accepted but not yet consumed by the Phase-1 transform/runtime (the transform instruments all element/component markers; attrs/state capture is Phase 3). The live browser round-trip (real file edit → HMR → re-registration → picker resolves new line) is validated by tasks 0014/0015, as ADR-106 anticipated.
