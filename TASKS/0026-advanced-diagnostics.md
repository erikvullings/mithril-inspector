# 0026 Phase 5: advanced diagnostics

Status: open
Priority: low
Owner: unassigned
Agent: claude-opus
Area: diagnostics
Depends on: 0022

## Context
REQUIREMENTS.md §21 Phase 5 ("consider"): redraw flash visualization, per-component update counts, render timing, slow-component warnings, route inspection, optional Chrome DevTools extension bridge. Exploratory scope — split into subtasks when picked up; features may be cut individually.

## Acceptance Criteria
- Scope decision recorded first: which Phase 5 features are in/out for the first diagnostics release, each with a one-line rationale (append to this file or a new ADR).
- Implemented features respect §17 performance targets (near-zero idle cost, rAF-throttled visuals) and §16 error isolation.
- Redraw/timing visuals are opt-in and off by default.
- Each shipped feature has unit tests plus a browser-test scenario in the 0015 suite.

## Implementation Notes
- Update counters already exist in `ComponentRecord.updateCount` (0017) — Phase 5 adds visualization, not new tracking.
- DevTools extension bridge: reuse the overlay UI per ADR-001; keep the protocol package as the boundary.
- Non-goals remain non-goals (§3.3): no attrs/state editing, no time-travel, no production debugging.

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
