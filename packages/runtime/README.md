# @mithril-inspector/runtime

Runtime registration, component tracking, vnode ownership and DOM/source
association for Mithril Inspector (REQUIREMENTS.md §4, §7). No UI, and no Vite or
bundler dependencies (ADR-004) — the only dependency is
`@mithril-inspector/protocol`. It composes the mechanisms validated by the
Phase 0 spikes: vnode→DOM association (ADR-101), fragment-root components
(ADR-104), lifecycle hook composition (ADR-105), component-instance tracking
(ADR-103) and HMR mapping survival (ADR-106).

Phase 1 ships the `"source"` mode: an element-to-source registry plus
DOM/source association so the overlay can resolve a hovered DOM node to its
original source location.

## Transform-facing contract

The build-time transform (`@mithril-inspector/transform`) injects imports of
three named exports and calls them from instrumented code — these names and
signatures are a stable contract:

```ts
import {
  registerModule as __miRegisterModule,
  source as __miSource,
  component as __miComponent,
} from "@mithril-inspector/runtime"

// Once per module (HMR-replaceable, keyed by the stable module id):
__miRegisterModule("m:<hash>", { file, relativeFile, sources })

// Around every hyperscript call (returns the vnode unchanged; metadata lives
// in a WeakMap, never in enumerable attrs, §6.2):
__miSource("m:<hash>:s2", m("article.user-card", …))

// Around every component definition (returns the instrumented definition):
export const UserCard = __miComponent("m:<hash>:s1", { view: … })
```

## Global hook

The runtime installs a single dev-only hook at `window.__MITHRIL_INSPECTOR__`
(protocol version 1, §7.1) exposing the standard
`registerModule` / `registerComponent` / `registerVNode` / `associateDom` /
`disposeVNode` / `subscribe` / `getSnapshot` methods, plus a richer resolution
API the overlay uses:

```ts
import { getInspectorHook } from "@mithril-inspector/runtime"

const hook = getInspectorHook()
hook.resolveDomSource(node)     // nearest SourceLocation for a DOM node, or null
hook.resolveDomComponent(node)  // nearest ComponentId owning a DOM node, or null
hook.sourceOfVnode(vnode)       // source stamped on a specific vnode, or null
hook.excludeHost(overlayHost)   // keep the overlay host out of tracking (§8.2)
hook.setMode("source")          // "source" | "components" | "full" (scaffolding)
hook.getSnapshot()              // { components, vnodes, modules, domAssociations }
```

Associations are batched on a microtask after each render pass (§9.4); call
`hook.flush()` to force one synchronously. All node/vnode/state keys are held
weakly, and instance records are cleaned when a component unmounts (§17). Every
entry point runs inside an error boundary: a failure is caught, the host render
is never broken, and a repeatedly-failing feature disables itself (§16).

## Public API (§14)

For application patterns the transform cannot reach:

```ts
import {
  inspectComponent,        // instrument a component explicitly (functional)
  setInspectorDisplayName, // override a component's display name (functional)
  markInspectorHidden,     // hide a component from the tree
  setInspectorSerializer,  // attach an attrs/state redaction serializer
  inspectSource,           // reserved; returns the vnode unchanged in Phase 1
} from "@mithril-inspector/runtime"
```

## Known Phase 1 limitations

- Class and standalone-`function` component *declarations* are registered for
  display-name resolution but not lifecycle-wrapped (their element picking still
  works via `source()`); object and closure components are fully instrumented.
- `mode` is scaffolding: `source`, `components` and `full` are accepted but do
  not yet gate behaviour differently.
- `inspectSource` and per-node vnode ids in `getSnapshot` are placeholders for
  later phases.
```
