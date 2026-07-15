# 0003 Spike: source-map preservation through TS/JSX

Status: open
Priority: high
Owner: unassigned
Agent: claude-fable
Area: spike
Depends on: 0001

## Context
Phase 0 spike 2 (REQUIREMENTS.md §21). The inspector transform must inject code while returning high-resolution source maps so editor navigation lands in the original `.ts`/`.tsx` file, not Vite output (§6.7). Uncertainty: does the map survive when chained with TypeScript transformation, JSX transformation, and other source-map-producing plugins? This spike also drives parser selection (§22: Babel, SWC, TS compiler API, Acorn, or Oxc; prefer correctness and source-map quality over speed; never regex).

## Acceptance Criteria
- Prototype transform (MagicString or equivalent) injects a call wrapper around an `m(...)` expression and produces a source map.
- Chained through esbuild/Vite TS transform and a JSX transform; a mapped position in final output resolves back to the exact original line/column in the `.ts`/`.tsx` fixture.
- Documented result for at least: plain TS, TSX with `/** @jsx m */`, and one extra source-map-producing plugin in the chain (§6.7 test list).
- ADR written recommending the parser/codegen stack for package `transform` (0009), with measured source-map fidelity as the deciding criterion.

## Implementation Notes
- One-based line/column in public APIs (§6.3).
- Vite plugin-order implications (`enforce: "pre"`, §11.3) — note findings for 0013.
- JSX may be marked experimental and restricted to Mithril's hyperscript factory initially (§6.6).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
