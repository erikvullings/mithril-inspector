# 0009 Transform package: AST source instrumentation

Status: open
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
