# 0018 Phase 2: display name resolution

Status: done
Priority: medium
Owner: unassigned
Agent: claude-sonnet
Area: runtime
Depends on: 0009, 0017

## Context
REQUIREMENTS.md §9.2: resolve component display names in priority order — 1. explicit inspector name, 2. `component.displayName`, 3. variable/export name from the AST transform, 4. class name, 5. function name, 6. filename-derived, 7. `Anonymous`. Requires transform support (emit discovered names in module metadata) plus runtime resolution.

## Acceptance Criteria
- Transform (0009) captures variable/export names for component declarations into `ModuleInspectionMetadata`/`SourceLocation.displayName`.
- Runtime resolves names strictly in the §9.2 order; each tier covered by a unit test (including `UserCard.displayName = "UserCard"` and `defineInspectorName(UserCard, "UserCard")` / `setInspectorDisplayName`).
- Anonymous/inline components show filename-derived names when possible, `Anonymous` otherwise; UI marks inferred names as inferred (§2.4).
- Names survive HMR module replacement.

## Implementation Notes
- Keep `defineInspectorName` and `setInspectorDisplayName` aliases consistent — §9.2 and §14 use both spellings; export one canonical function with the other as an alias, document it.
- Names feed the hover badge (0012), ancestry panel (0019) and tree (0022).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
- 2026-07-17 claude-sonnet: Implemented the task. Investigation found the first acceptance-criteria line and most of the §9.2 order already shipped by 0009/0017: the transform (`packages/transform/src/instrument.ts`) already captures variable/export/class/function-declaration names into `SourceLocation.displayName` for `component-declaration`/`component-view` markers (extensively tested in `transform.test.ts`, unchanged this task), and the runtime's `resolveDisplayName` (`packages/runtime/src/components.ts`) already implemented tiers 1–5 (explicit override → `component.displayName` → transform-discovered name → class/function `.name`, the latter two collapsing into one `.name` check since a given `def` is only ever one of them). Two real gaps remained, both now closed:
  1. **Tier 6 (filename-derived name) was entirely missing** — the chain fell straight from tier 5 to `"Anonymous"`. Added `filenameDerivedName()` (basename, one extension stripped) and wired it into `resolveDisplayName`, which now returns `{ name, inferred }` instead of a bare string. `toRecord`'s existing `kind: "anonymous"` read-time refinement is unaffected in the case it was written for (no source at all, `qualifiedId === ""`) but correctly *no longer* fires for an anonymous component backed by a real (nameless) source location, since that now resolves to a real filename-derived name rather than `"Anonymous"` — a filename is "some" resolved name per §2.4's ladder, not "unresolvable."
  2. **`defineInspectorName` didn't exist** — only `setInspectorDisplayName` was exported, despite the task's own Implementation Notes flagging the §9.2/§14 spelling split. Added `defineInspectorName` in `packages/runtime/src/api.ts` as a `const` alias (`= setInspectorDisplayName`, same reference, documented via JSDoc) and exported it from `index.ts`.

  Added `ComponentRecord.displayNameInferred: boolean` (and the matching optional field on `ComponentPatch`) to `packages/protocol/src/index.ts`, set by `toRecord`/`componentsSnapshot` for every record: `false` for tiers 1–5, `true` for tiers 6–7. Wired through the overlay (`packages/overlay/src/controller.ts`'s `componentNameOf` now returns `{ name, inferred } | null` instead of a bare string, consumed by both `HoverInfo.componentName` and `OverlayViewState.selectedComponentName`) so `packages/overlay/src/view.ts` can render the existing `.mi-precision-inferred` badge (already styled, previously only used for source-mapping precision) next to an inferred component name in both the hover badge and the details panel's "Component" row — satisfying the acceptance criterion's "UI marks inferred names as inferred (§2.4)" literally, not just at the data-model level.

  Resolution reads live from the source registry on every call (never cached on the instance record), so HMR survival needed no new mechanism — added an explicit regression test proving a re-registered module's renamed declaration takes effect for an already-mounted instance without re-instrumenting.

  **Verified**: 9 new/changed tests in `packages/runtime/src/components.test.ts` (one test per §9.2 tier 1–6 including two explicit precedence checks against lower tiers, one HMR-survival test, `displayNameInferred` added to the pre-existing tier-7 "anonymous" test — 38 total in the file, up from 29), 1 new test in `packages/runtime/src/api.test.ts` (`defineInspectorName` alias + reference-equality check, 6 total), 1 fixture fix in `packages/runtime/src/runtime.test.ts` (added the new required field to a hand-built `ComponentRecord` literal). All verified via `vitest run src/components.test.ts src/api.test.ts src/runtime.test.ts` (59 passed). Overlay: 1 new test in `packages/overlay/src/controller.test.ts` (inferred flag flows into `HoverInfo.componentName`, 18 total) + 1 new end-to-end DOM test in `packages/overlay/src/overlay.test.ts` asserting the actual `.mi-precision-inferred` badge and "Inferred" text render inside `.mi-hb-component` (18 total), verified via `vitest run src/controller.test.ts src/overlay.test.ts` (36 passed). Full-suite regression check: `vitest run` in both `packages/runtime` (95 passed) and `packages/overlay` (122 passed), `tsc -p tsconfig.json --noEmit` clean in both (no new `any`, no unused symbols). Whole-workspace `pnpm -r typecheck`, `pnpm -r build`, `pnpm -r test` (excluding/including `tests/browser`) and `pnpm test:browser` all green (18 browser tests passed against the fresh build) — no regressions in `transform`, `server`, `vite`, or the spike packages.

  Known scope note: per the task's own Implementation Notes ("Names feed the hover badge (0012), ancestry panel (0019) and tree (0022)"), only the hover badge and the existing single-component details panel (0012, already shipped) were updated to show the inferred marker — the ancestry panel (0019) and full tree (0022) don't exist yet and will consume `displayNameInferred` when built.
