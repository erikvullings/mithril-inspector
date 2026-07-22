# @mithril-inspector/transform

Bundler-neutral AST source instrumentation for Mithril Inspector. No Vite,
Rollup, webpack or esbuild dependency (ADR-004) — a bundler adapter (`vite`,
`rollup`, `esbuild`, `webpack`) calls `transformMithrilModule` directly from
its own load/transform hook and is responsible for wiring the result into
whatever plugin API it targets.

## What it does

Given a module's source text, `transformMithrilModule` walks the AST and:

- tags every `m(...)` hyperscript call (standard calls; experimental JSX/TSX)
  with a stable per-call source id, without changing its return value or
  argument evaluation order;
- detects object, closure, class and function component definitions and
  registers each one's declaration (and, when it has its own span, its
  `view`) as a `component-declaration`/`component-view` source marker;
- injects a single `__miRegisterModule("m:<hash>", { file, relativeFile, sources })`
  call per module, keyed by a stable module id that survives HMR
  re-execution (ADR-106);
- emits a high-resolution source map by default, verified to trace back to
  the original TypeScript through a real compile (task 0009).

The runtime-facing contract these injected calls rely on
(`__miRegisterModule`/`__miSource`/`__miComponent`) is documented in
`packages/runtime/README.md`.

## Usage

```ts
import { transformMithrilModule } from "@mithril-inspector/transform"

const result = transformMithrilModule({
  id: "/abs/path/to/Component.tsx",
  code: sourceText,
  root: projectRoot,
  sourcemap: true,
  runtimeModule: "virtual:mithril-inspector/runtime", // adapter-specific
  mithrilImports: ["mithril"],
  hyperscriptIdentifiers: ["m"],
})
// result.code, result.map, result.sources (ModuleRegistration)
```

`include`/`exclude` accept the same `FilterPattern` shape as
`@rollup/pluginutils`'s `createFilter`. `clearTransformCache()` drops any
per-module memoization the transform keeps internally — an adapter calls it
on a full invalidation (e.g. config change), not on ordinary per-file HMR.

## Scope

Registers components for display-name resolution and source-level picking
regardless of kind; only object and closure components are lifecycle-wrapped
for instance tracking by the runtime today (`packages/runtime/README.md`
"Known Phase 1/2 limitations"). `m.route()` table entries shaped `{ render }`
are not yet detected as component definitions (task 0017 follow-up).
