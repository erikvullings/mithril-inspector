# 0023 Phase 4: Rollup adapter

Status: open
Priority: low
Owner: unassigned
Agent: claude-sonnet
Area: adapters
Depends on: 0009, 0010, 0011

## Context
REQUIREMENTS.md §12.3, §21 Phase 4: `@mithril-inspector/rollup` — a thin adapter over the shared `transformMithrilModule` (0009), runtime (0010) and server handler (0011). No duplicated transform or editor-launch logic (§4).

## Acceptance Criteria
- Rollup plugin supports AST transformation, runtime import resolution, watch mode, and source maps (§12.3).
- Editor launching documented and supported via one of: compatible dev-server integration, a separately started inspector server (from `@mithril-inspector/server`), or a configured endpoint URL (§12.3).
- Dev-only guard equivalent to §2.1; production output contains no inspector code.
- Unit tests: transform wiring, virtual/runtime module resolution, map pass-through; a minimal fixture build in `tests/integration/`.

## Implementation Notes
- Vite's plugin (0013) is Rollup-compatible in parts — extract shared adapter utilities rather than copy them, but do not make core packages import Vite (ADR-004).
- Standalone inspector server: expose a small `startInspectorServer(options)` in the server package if not already present from 0011.

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
