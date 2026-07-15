# 0008 Protocol package: shared types and constants

Status: open
Priority: high
Owner: unassigned
Agent: claude-haiku
Area: protocol
Depends on: 0001

## Context
REQUIREMENTS.md §4 defines `@mithril-inspector/protocol`: shared serializable types and constants with NO browser, Node, or bundler dependencies. Every other package imports from it, so it must land before transform/runtime/server/overlay work starts.

## Acceptance Criteria
- Package exports (at minimum, per §6.3, §7.1–7.3, §7.6, §9.4, §10.1): `SourceLocation`, `ModuleRecord`/`ModuleInspectionMetadata`, `ComponentRecord`, `ComponentPatch`, `VNodeRecord`, `DomAssociation`, `DomRange`, `RuntimeEvent`, `InspectorSnapshot`, `MithrilInspectorHook`, ID types (`ComponentId` = `c:${number}`, `VNodeId` = `v:${number}`, `ModuleId` = `m:${string}`), `PROTOCOL_VERSION = 1`, and open-in-editor request/response/error shapes (§10.1).
- Zero runtime dependencies; type-only or const-only exports; compiles for both browser and Node consumers.
- Lines/columns documented as one-based (§6.3).
- Unit tests cover ID constructors/guards and any runtime constants.

## Implementation Notes
- `DomRange` uses `Node | null` — keep DOM types as `import type` from lib.dom so the package stays dependency-free but browser-typed where needed; the serializable subset (for events) must not contain live Node references.
- Error codes for the editor endpoint (e.g. `FILE_OUTSIDE_ROOT`) live here so server and overlay agree.
- Keep this package small and stable; version bumps ripple everywhere.

## Agent Notes
- 2026-07-15: task created from REQUIREMENTS.md conversion; no work started.
