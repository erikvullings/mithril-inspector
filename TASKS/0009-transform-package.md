# 0009 Transform package: AST source instrumentation

Status: done
Priority: high
Owner: unassigned
Agent: claude-fable
Area: transform
Depends on: 0003, 0008

## Context
REQUIREMENTS.md §4, §6: `@mithril-inspector/transform` exposes the bundler-neutral `transformMithrilModule(options: TransformOptions): TransformResult | null` that injects compact source IDs (`__miSource("m17:s2", m(...))`, `__miComponent`, `__miRegisterModule`) into dev code. Full source records are registered with the runtime, never put in DOM attributes by default. Parser choice comes from spike 0003's ADR.

## Acceptance Criteria
- `transformMithrilModule` implemented per the §4 signature; returns `null` for files without Mithril usage.
- Import detection (§6.4): default/named/renamed/require Mithril imports, any local binding name; unrelated `m` functions NOT transformed; `mithrilImports` and `hyperscriptIdentifiers` options honored.
- Component detection (§6.5): object, closure, class, inline components, and imported-component usage locations.
- Source IDs emitted for elements, component views, component declarations with `kind` per `SourceLocation` (§6.3); one-based line/column.
- Valid high-resolution source maps chained through TS + JSX + another map-producing plugin (§6.7 tests).
- JSX/TSX supported via compiler AST, may be flagged experimental for hyperscript-factory configs only (§6.6).
- Fixture-based snapshot tests per §19.1 (aliased imports, all component forms, nested calls, fragments, arrays, keyed lists, trusted HTML, JSX/TSX, odd formatting, unrelated `m`, no-Mithril files, syntax errors) AND executed-fixture tests, not snapshots alone.
- Deterministic output; transform cache keyed by file content + options (§17).

## Implementation Notes
- Parser/codegen stack per 0003 ADR; MagicString or equivalent for map-aware edits (§22). No regex transforms (§22).
- Emitted runtime import path must be adapter-configurable (Vite uses `virtual:mithril-inspector/runtime`, §11.2).
- Metadata (`ModuleInspectionMetadata`) returned alongside code for the plugin layer.
- Skip generated/declaration files; no Vite imports in this package (ADR-004).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
- 2026-07-16 claude-fable: Implemented `transformMithrilModule` per §4 with the ADR-102 stack (`@babel/parser` 8 analysis-only + hand-rolled walk, MagicString hires maps, no regex transforms). Import detection (§6.4): default/renamed/`{ default as x }`/top-level `require()` bindings plus `mithrilImports`/`hyperscriptIdentifiers` options (identifiers match the *imported* name, so aliases follow); calls through shadowing params/locals are excluded by a function-granular scope tracker that only ever fails toward "don't instrument". Component detection (§6.5): object/closure/class/inline forms get `component-declaration` + `component-view` markers — expressions wrap in `__miComponent(...)`, named function/class declarations get a trailing `__miComponent("id", Name);` statement — and `m(Component)` usage sites record `kind: "element"` with `displayName` (§6.3 has no usage-specific kind). `m.fragment`/`m.trust` are instrumented as elements with Mithril's internal tags `[`/`<`. Registration emits the ADR-106 payload `__miRegisterModule("m:<path-hash>", { file, relativeFile, sources })` with a path-stable module id; full `ModuleInspectionMetadata` (protocol) is returned for the plugin layer; the runtime import specifier is adapter-configurable via `runtimeModule` (tested with `virtual:mithril-inspector/runtime`). Skips: `\0`-virtual ids, `.d.(m|c)?ts`, non-script extensions, include/exclude filters (`@rollup/pluginutils`), parse errors → null. Deterministic output; bounded LRU cache keyed by content hash + options with `clearTransformCache()` (§17). Verified: 59 new tests + 1 updated across `src/transform.test.ts` (34), `src/sourcemap.test.ts` (3: TS erasure, TSX pragma, +minify stage — all traced positions exact), `src/execute.test.ts` (4 executed fixtures: instrumented modules render identical vnode trees to the originals and drive the stub runtime), `src/snapshots.test.ts` (18 over 15 instrumented + 3 null fixtures incl. syntax errors); `pnpm vitest run` in the package = 60/60, `pnpm -r test/typecheck/build` clean. Known limitations: JSX wrapping is expression-position roots only (children inherit the root mapping, §6.6 experimental, per ADR-102); assignment-form components (`exports.App = { view }`) get element markers but no declaration marker; `require()` detection is top-level only; block-scoped shadows suppress instrumentation for the whole enclosing function (safe direction). No README/CLAUDE.md changes — repo docs carry no per-package detail (matching task 0008).
