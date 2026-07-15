# 0019 Phase 2: ancestry panel and reveal component source

Status: open
Priority: medium
Owner: unassigned
Agent: claude-sonnet
Area: overlay
Depends on: 0012, 0017, 0018

## Context
REQUIREMENTS.md §21 Phase 2 UI: nearest-component lookup surfaced in the overlay — component ancestry list (`App └─ UserList └─ UserCard`, §8.3), "Reveal component" and multi-target source opening. Completes MVP acceptance item §20.1.10 (basic component ancestry view) and §20.1.6 (ancestry correctness in browser tests).

## Acceptance Criteria
- Selecting an element shows its owning component and full ancestry chain with resolved display names.
- Clicking an ancestor highlights its DOM range and shows its source; "Open in editor" works per ancestor.
- When multiple source locations exist, an "Open: rendered element / component view / component declaration" choice is offered, defaulting to the most precise (§9.3).
- Exact vs inferred mapping visibly distinguished (§2.4).
- Browser test §19.2.6 (ancestry correct) enabled in the 0015 suite; update 0016's checklist if it recorded an ancestry gap.

## Implementation Notes
- Ancestry comes from `ComponentRecord.parentId` chains (0017); the panel must tolerate hidden components (`markInspectorHidden`) by skipping them.
- Stale-selection behavior per §8.8 applies to ancestry entries too.

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
