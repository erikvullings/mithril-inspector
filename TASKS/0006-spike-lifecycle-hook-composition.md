# 0006 Spike: lifecycle hook composition

Status: open
Priority: high
Owner: unassigned
Agent: claude-opus
Area: spike
Depends on: 0001

## Context
Phase 0 spike 5 (REQUIREMENTS.md §21). The runtime must wrap/inject Mithril lifecycle hooks (`oninit`, `oncreate`, `onbeforeupdate`, `onupdate`, `onbeforeremove`, `onremove`) without observable change to the application (§7.7): call existing hooks, preserve `this`, return values, ordering; don't swallow exceptions; don't modify `vnode.state`; clean mappings on removal. Async `onbeforeremove` must remain intact.

## Acceptance Criteria
- Prototype wraps all six hooks on a fixture component; a test asserts original hooks receive correct `this`, arguments, and that return values pass through (especially `onbeforeupdate` returning `false` and `onbeforeremove` returning a Promise that delays removal).
- Exceptions thrown by application hooks propagate unchanged.
- Inspector mappings are cleaned in `onremove` without interfering with application `onremove`.
- ADR written on the composition strategy (wrap on vnode vs on component definition) and its edge cases.

## Implementation Notes
- Hooks can live on the component definition AND on the vnode (attrs hooks) in Mithril; both paths must compose.
- Never add hooks that trigger extra redraws or change redraw scheduling (§2.3).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
