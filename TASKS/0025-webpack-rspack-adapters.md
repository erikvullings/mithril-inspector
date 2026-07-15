# 0025 Phase 4: Webpack and Rspack adapters

Status: open
Priority: low
Owner: unassigned
Agent: claude-sonnet
Area: adapters
Depends on: 0009, 0010, 0011

## Context
REQUIREMENTS.md §12.5, §21 Phase 4: `@mithril-inspector/webpack` (and Rspack via the same surface where possible) — a loader for module transformation, a plugin for virtual/runtime entry injection, and dev-server middleware for editor launching. Explicitly "implement later"; lowest adapter priority.

## Acceptance Criteria
- Loader calls the shared `transformMithrilModule`; source maps chained correctly with ts-loader/babel-loader configurations.
- Plugin injects runtime/overlay entries without requiring app-entry edits; dev-only by default.
- `webpack-dev-server` / Rspack dev-server middleware wires `createInspectorMiddleware` (0011).
- Rspack compatibility verified or divergences documented (§25.9).
- Unit tests for loader transform wiring and middleware registration; one integration fixture per bundler.

## Implementation Notes
- Runtime must not depend on Vite-specific APIs (§12.5) — already guaranteed by ADR-004, but verify no `import.meta.hot` leakage in shared code paths.
- HMR support here is best-effort; document what survives module replacement.

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
