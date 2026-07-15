# 0024 Phase 4: esbuild adapter and playground

Status: open
Priority: low
Owner: unassigned
Agent: claude-sonnet
Area: adapters
Depends on: 0009, 0010, 0011

## Context
REQUIREMENTS.md §12.4, §21 Phase 4: `@mithril-inspector/esbuild` using `build.onResolve` / `build.onLoad` / `build.onEnd`, supporting transformation and runtime injection, with an optional helper dev server for open-in-editor. Repo layout (§4) includes `apps/playground-esbuild`.

## Acceptance Criteria
- esbuild plugin transforms Mithril modules via the shared `transformMithrilModule` and injects the runtime; source maps preserved.
- Helper development server (reusing `@mithril-inspector/server`) provides the open-in-editor endpoint; overlay bootstrap injection documented for esbuild-served HTML.
- `apps/playground-esbuild` demonstrates picker → open-in-editor end-to-end.
- Production/minified builds exclude all inspector code by default.
- Unit tests for onResolve/onLoad wiring; integration fixture build.

## Implementation Notes
- esbuild has no HTML pipeline: document the manual `<script>` injection or serve-mode injection strategy.
- No HMR in plain esbuild serve — mapping-invalidation logic (0007) does not apply; note this as a documented limitation (§25.9).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
