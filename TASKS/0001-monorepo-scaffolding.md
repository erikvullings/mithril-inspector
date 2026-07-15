# 0001 Monorepo scaffolding

Status: done
Priority: high
Owner: unassigned
Agent: claude-sonnet
Area: infra
Depends on: none

## Context
REQUIREMENTS.md §4 and §22 define a pnpm-workspace, package-based monorepo for Mithril Inspector, an open-source dev tool for Mithril.js apps (element picker, source navigation, component tree). Everything else builds on this skeleton. Repo layout:

```text
mithril-inspector/
├─ apps/            playground-vite/, playground-esbuild/, test-fixtures/
├─ packages/        protocol/, transform/, runtime/, overlay/, server/, vite/, rollup/, esbuild/, webpack/
├─ tests/           fixtures/, integration/, browser/
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.json
└─ vitest.workspace.ts
```

## Acceptance Criteria
- `pnpm install` succeeds at the repo root with all workspace packages resolved.
- Every package under `packages/` exists with `package.json` (name `@mithril-inspector/<name>`), `tsconfig.json`, `src/index.ts`, and a passing placeholder Vitest test.
- Strict TypeScript (`strict: true`) everywhere; `pnpm -r build` and `pnpm -r test` pass with zero compiler warnings/errors.
- Packages are modern ESM; core packages (protocol, transform, runtime, overlay, server) do not import Vite (§25.4, ADR-004).
- `vitest.workspace.ts` runs tests per package independently.

## Implementation Notes
- pnpm workspaces + Vitest + TypeScript strict (§22).
- Set up shared base tsconfig; per-package extends.
- Add basic lint/format if trivial, but do not gold-plate — this task is scaffolding only, no feature code.
- Apps (`playground-vite` etc.) can be empty placeholders here; they get real content in 0014 and 0024.

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
- 2026-07-15 codex: Initialized the repository and scaffolded the pnpm workspace, nine strict TypeScript ESM packages, independent Vitest projects, placeholder apps/test areas, and scoped contributor docs. Verified a frozen-lockfile install, 9 new placeholder tests via the nine `src/index.test.ts` files, recursive build, recursive full test suite, strict typecheck, and warning-free root workspace run. No known limitations.
