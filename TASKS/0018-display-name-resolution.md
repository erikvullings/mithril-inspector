# 0018 Phase 2: display name resolution

Status: open
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
