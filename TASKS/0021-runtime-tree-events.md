# 0021 Phase 3: batched runtime tree events

Status: open
Priority: medium
Owner: unassigned
Agent: claude-opus
Area: runtime
Depends on: 0017

## Context
REQUIREMENTS.md §9.4: the component tree UI must not rebuild on every redraw. The runtime emits batched `RuntimeEvent`s (`components-added` / `components-updated` (patches) / `components-removed` / `dom-associated` / `reset`), coalesced per microtask or animation frame, delivered via `subscribe` on the global hook (§7.1) alongside `getSnapshot()`.

## Acceptance Criteria
- Mount/update/unmount of components produce correct batched events; a redraw touching N components yields one batch, not N notifications (unit-tested with fake timers/rAF).
- `ComponentPatch` carries only changed fields (updateCount, updatedAt, domRange, childIds...) — no full-record spam.
- `getSnapshot()` + subsequent events are consistent (no missed or duplicated records when subscribing mid-stream).
- `reset` emitted on HMR full-invalidation and on multiple-runtime detection (§16).
- Event batching test from §19.1 runtime list passes; overhead stays within §17 targets in `components`/`full` modes.

## Implementation Notes
- Records crossing the event boundary must be serializable-safe (no live DOM nodes in event payloads; DOM lookups stay behind hook methods).
- Subscription returns an unsubscribe function (§7.1); listeners must be exception-isolated (§16).

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
