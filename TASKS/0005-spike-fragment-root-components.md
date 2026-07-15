# 0005 Spike: fragment-root components

Status: open
Priority: high
Owner: unassigned
Agent: claude-opus
Area: spike
Depends on: 0001

## Context
Phase 0 spike 4 (REQUIREMENTS.md §21). Components returning arrays/fragments produce multiple root DOM nodes; the inspector must select such a component through any of its rendered nodes (MVP acceptance §20.1.9) and represent the output as `DomRange { first, last }` (§7.6).

## Acceptance Criteria
- Prototype maps every rendered node of a fragment-root component back to that component and its source ID.
- `DomRange` first/last stay correct after a redraw that adds/removes/reorders fragment children.
- Empty fragments (no DOM output) and fragments with mixed text/element children handled without errors.
- ADR written recording how fragment ranges are captured and maintained.

## Implementation Notes
- Builds conceptually on 0002's mechanism, but is listed as an independent spike — coordinate findings in both ADRs.
- Mithril `vnode.domSize` tracks fragment width; verify reliability during async removal (`onbeforeremove`).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
