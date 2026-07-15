# ADR-102: Parser/codegen stack and source-map preservation for the transform

Status: accepted (validated by spike, TASKS/0003)
Date: 2026-07-15
Related: REQUIREMENTS.md §6.3, §6.4, §6.6, §6.7, §11.3, §22; ADR-101; feeds tasks 0009 and 0013

## Context

The inspector transform injects `__miSource(...)` wrappers into development
code but editor navigation must land in the original `.ts`/`.tsx` file, so the
transform's source map has to survive being chained through TypeScript
erasure, JSX lowering and any other map-producing plugin. §22 allows Babel,
SWC, the TS compiler API, Acorn or Oxc, prefers correctness and source-map
quality over speed, and forbids regex transforms. This spike selects the stack
by measuring end-to-end map fidelity.

## Decision

Use, for the `transform` package (task 0009):

- **`@babel/parser` (v8)** with the `typescript` and `jsx` plugins for
  analysis only — it provides exact byte offsets plus 1-based/0-based `loc`
  data for every node, handles TS and TSX natively, and is a pure-JS
  dependency. No `@babel/traverse` or `@babel/generator`: a small hand-rolled
  pre-order walk suffices and the original text is never re-printed.
- **MagicString** for code injection (`appendLeft`/`appendRight`/`prepend`)
  with `generateMap({ hires: true })` — surgical edits keep every untouched
  byte identical, which is what makes the high-resolution map exact.
- **`@ampproject/remapping`** to compose chained maps (newest first) — the
  same library Vite uses internally — and **`@jridgewell/trace-mapping`** to
  resolve positions in tests.

Public marker positions are 1-based line *and* column (§6.3); trace-mapping's
0-based columns are converted only at the query boundary.

## Measured source-map fidelity (deciding criterion)

Prototype: `tests/fixtures/spikes/sourcemap-preservation/` (esbuild 0.28,
Babel 8.0, magic-string 0.30). Every assertion requires an exact original
line *and* column — 13 of 13 traced positions were exact:

| Pipeline | Traced positions | Result |
| --- | --- | --- |
| inspector transform only (`.ts`) | 4 `m(...)` calls, two sharing a line | 4/4 exact |
| inspector → esbuild TS erasure | same 4 calls in final JS | 4/4 exact |
| inspector → esbuild TSX (`/** @jsx m */`) | lowered `m("section")`/`m("h1")` back to `<section`/`<h1` | 2/2 exact |
| inspector → esbuild TS → esbuild minify | 4 selector literals collapsed onto one minified line | 4/4 exact, distinct columns |

## Findings for the Vite plugin (task 0013)

- The transform must run with `enforce: "pre"` so it sees original TS/TSX
  before Vite's esbuild pass (§11.3); the whole spike models that order.
- esbuild still honors the `/** @jsx m */` pragma when the inspector's
  runtime import is prepended above it (verified on esbuild 0.28).
- JSX instrumentation is experimental and limited to expression-position JSX
  roots: a call wrapper is not valid syntax in JSX-child position, so nested
  elements inherit their parent mapping until task 0009 adds another
  mechanism (§6.6).
- Modules without a mithril default import — and modules where nothing was
  instrumented — return `null` so the bundler keeps the original module and
  map untouched (§6.4).

## Rejected alternatives

- **Regex transforms.** Forbidden outright (§22).
- **Full Babel pipeline (`@babel/traverse` + `@babel/generator`).**
  Re-printing the module regenerates every mapping and degrades untouched
  code to statement-level precision; also far heavier at runtime.
- **TypeScript compiler API.** Emit-based maps are coarser than MagicString's
  hires maps, and carrying the full compiler for position discovery is
  disproportionate.
- **SWC.** Native dependency; its JS-facing span offsets are arena-relative
  (a long-standing footgun), which makes MagicString offset surgery fragile.
- **Acorn.** No first-class TypeScript support; the plugin ecosystem for TS
  is thin and lags the language.
- **Oxc.** Fast and offset-compatible with MagicString — the most credible
  future swap. Not chosen now because §22 prioritizes correctness and map
  quality over speed and its transform/source-map APIs are still moving.
  Revisit if transform time becomes a measured bottleneck; the MagicString
  pipeline (and therefore the fidelity result) would be unchanged.
