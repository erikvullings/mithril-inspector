# 0007 Spike: HMR mapping survival

Status: open
Priority: high
Owner: unassigned
Agent: claude-opus
Area: spike
Depends on: 0001

## Context
Phase 0 spike 6 (REQUIREMENTS.md §21). When Vite HMR replaces a module, module/source registrations become stale. The inspector must invalidate module metadata, register replacement source records, preserve UI selection when possible, and never permanently corrupt the registry (§11.2 `handleHotUpdate`, MVP acceptance §20.1.11).

## Acceptance Criteria
- Prototype in a minimal Vite + Mithril app: edit a component file, HMR fires, and after the update hovering the re-rendered element resolves to the NEW line numbers.
- Stale source registrations for the replaced module are removed (no unbounded registry growth across repeated edits).
- A selected element/component survives the update when its identity is recoverable, or degrades to a documented "stale" state — never a crash.
- ADR written describing the invalidation/re-registration protocol between plugin (`handleHotUpdate`) and runtime.

## Implementation Notes
- Module IDs (`m:<string>`, §7.2) should be stable per file path so re-registration can replace rather than append.
- Findings feed directly into 0013 (Vite plugin `handleHotUpdate`).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
