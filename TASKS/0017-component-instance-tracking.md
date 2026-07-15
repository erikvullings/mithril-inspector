# 0017 Phase 2: component instance tracking

Status: open
Priority: medium
Owner: unassigned
Agent: claude-opus
Area: runtime
Depends on: 0004, 0010

## Context
REQUIREMENTS.md §21 Phase 2: mounted component-instance IDs and parent-child tracking in the runtime, using the mechanism proven in spike 0004. Produces `ComponentRecord`s (§7.3) with stable IDs (§7.2), ownership scopes (§7.5), and `DomRange` links — the data layer for ancestry (0019) and the full tree (0022).

## Acceptance Criteria
- Stable `ComponentId` per mounted instance across redraws; new instance ⇒ new ID; unmount ⇒ record marked unmounted and cleaned (weakly held, §17).
- `ComponentRecord` fields populated: id, parentId, displayName (raw for now — resolution polish in 0018), source, kind (object/closure/class/function/route-resolver/anonymous), mounted, createdAt/updatedAt/updateCount, domRange, childIds. Attrs/state captured as references only — safe serialization arrives in 0020.
- Vnode ownership per §7.5: enter/leave component scope around wrapped views; nested component vnodes start new scopes; no reliance on global-`m` call-stack interception (ADR-005).
- Nearest-component lookup for a DOM node returns correct instance including fragment roots and keyed reorders.
- `mode: "components"` (§17) activates this tracking; `mode: "source"` skips it; overhead in components mode within the <20% median redraw target on the playground (spot-check, not a benchmark suite).
- Runtime unit tests: parent-child ownership, keyed reorder identity, multiple roots, unmount cleanup, route-resolver components.

## Implementation Notes
- Do not claim correctness until keyed redraws, fragments, multiple roots and unmount cleanup are tested (§25.10).
- `markInspectorHidden` (§14) must exclude a component and its subtree from records.
- Update the 0004 ADR if the production implementation deviates from the spike.

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
