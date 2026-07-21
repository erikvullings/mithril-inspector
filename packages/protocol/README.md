# @mithril-inspector/protocol

Shared, serializable types and protocol constants for Mithril Inspector.
This package has no bundler dependencies and no runtime
behavior of its own (ADR-004) — every other package (`transform`, `runtime`,
`overlay`, `server`, `vite`) depends on it for a common vocabulary instead of
duplicating type definitions.

## What's in it

- **ID types** (§7.2) — `ComponentId`, `VNodeId`, `ModuleId` branded string
  types plus their `make*`/`is*` constructors and guards.
- **`SourceLocation`** (§6.3) — a resolved module/line/column plus its `kind`
  (`component-declaration`, `component-view`, `element`, `attribute`,
  `text-expression`, `unknown`).
- **`ComponentRecord`/`ComponentPatch`** (§7.3) — the runtime's tracked
  component-instance shape (kind, display name, source, DOM range, child
  ids, attrs/state) and the partial-update shape used for batched patches.
- **`VNodeRecord`/`DomAssociation`/`DomRange`** (§7.6) — vnode-to-DOM mapping.
- **`RuntimeEvent`** (§9.4) — the discriminated union the runtime emits on
  `subscribe()`: `components-added`/`components-updated`/`components-removed`/
  `dom-associated`/`reset`.
- **`MithrilInspectorHook`** (§7.1) — the shape installed at
  `window.__MITHRIL_INSPECTOR__`.
- **`PreviewNode`** and friends (§7.4, §15, task 0020) — the safe, serializable
  preview tree used to show attrs/state without ever handing the UI a live
  object reference (primitives, containers with paging, redacted values,
  circular references, deferred getters, etc.).
- **`EditorRequest`/`EditorResponse`/`EditorErrorCode`** (§10.1) — the
  open-in-editor HTTP contract used between the overlay and `server`.

## Usage

```ts
import type { ComponentRecord, RuntimeEvent, SourceLocation } from "@mithril-inspector/protocol"
import { isComponentId, makeComponentId, PROTOCOL_VERSION } from "@mithril-inspector/protocol"
```

Every type here is plain data — no classes, no functions that hold state.
Consumers own the actual objects; this package only defines their shape.
