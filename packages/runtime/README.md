# @mithril-inspector/runtime

Runtime registration, component tracking, vnode ownership and DOM/source
association for Mithril Inspector (REQUIREMENTS.md §4, §7). No UI, and no Vite or
bundler dependencies (ADR-004) — the only dependency is
`@mithril-inspector/protocol`. It composes the mechanisms validated by the
Phase 0 spikes: vnode→DOM association (ADR-101), fragment-root components
(ADR-104), lifecycle hook composition (ADR-105), component-instance tracking
(ADR-103) and HMR mapping survival (ADR-106).

Phase 1 shipped the `"source"` mode: an element-to-source registry plus
DOM/source association so the overlay can resolve a hovered DOM node to its
original source location. Task 0017 (Phase 2) adds mounted component-instance
IDs and parent-child tracking (`ComponentRecord`, §7.3) behind the `mode`
gate — see "Modes" below.

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
hook.setMode("source")          // "source" | "components" | "full" (§17, see "Modes" below)
hook.invalidateModule("m:…")    // drop a module's stale sources on HMR (ADR-106)
hook.getRedactionConfig()       // resolved { keys, replacement } policy (§15)
hook.getSnapshot()              // { components, vnodes, modules, domAssociations }
```

## Configuration (`createRuntime`)

An adapter bootstrap creates the singleton with `createRuntime(options)` before
any module registers. Beyond `mode`/`debug`, two options are wired from the
adapter:

```ts
createRuntime({
  mode: "source",
  exposeDomAttributes: true,           // §13: add a compact, path-free
                                       // data-mi="m:<hash>:s2" attr to element
                                       // vnodes (off by default)
  redact: { keys: ["password"], replacement: "[redacted]" }, // §15 policy
})
```

`invalidateModule` is the pre-HMR step: the adapter's `handleHotUpdate` calls it
so the module's stale source table is dropped, and the re-executed module's own
`registerModule` restores a fresh one (ADR-106).

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

## Modes (§17, task 0017)

```ts
mode: "source"      // default — element/source mapping and editor navigation only
mode: "components"  // + component-instance tracking: class and route-resolver
                     //   kinds, render-ordered childIds (see below)
mode: "full"         // scaffolding — same as "components" today
```

Object and closure component instance-tracking (nearest-component lookup,
parent/child linkage) predates this gate — it was pulled forward into
`"source"` for the 0.1.0-alpha.1 release (task 0016) to support hover/basic
ancestry (§20.1.5, §20.1.10) and stays unconditional in every mode, so it does
not regress. `mode: "components"`/`"full"` *additionally* activate class and
route-resolver tracking, which task 0017 introduced already gated (there was
no earlier alpha behavior to preserve for those two kinds).

## Component instance tracking (task 0017)

`ComponentRegistry.instrument()` (internal; driven by the transform's
`__miComponent`) tracks these `ComponentRecord.kind` values:

- **`object`** / **`closure`** — always tracked, any mode (see above).
- **`anonymous`** — an `object`-shaped inline component with no discoverable
  name at all (§2.4); a read-time refinement, not a separate wrap path.
- **`class`** — tracked in `mode: "components"`/`"full"` via ADR-103's
  "prototype facade" mechanism, with one production caveat: a `class`
  constructor's own `.prototype` property is **non-writable** (unlike a plain
  `function`), so unlike object/closure the wrap can't be a fresh reference
  swapped in — it mutates the *existing* prototype object's `view` and six
  hooks in place instead (snapshotting the originals first so the wrapped
  methods don't recurse into themselves). This is more invasive than the
  object/closure path — it touches an object the application's own code still
  holds a reference to — but it's the only mechanism available for a
  `class Foo {}` *declaration* binding the transform can't rebind, and it
  works identically for `const Foo = class {}` expressions. `instanceof` and
  `.constructor` against the original class keep working (only specific
  methods are overwritten, not the prototype chain).
- **`route-resolver`** — an `m.route()` table entry shaped `{ render, onmatch? }`
  instead of `{ view }`. Tracked in `mode: "components"`/`"full"` as a *root*
  instance (a resolver has no lexical owner and no `vnode.state` of its own —
  Mithril calls `resolver.render(vnode)` directly, confirmed against
  `mithril/api/router.js`; the wrapped resolver object itself is the identity
  carrier). Has no unmount signal (a resolver just stops being called when the
  route changes), so once allocated it stays `mounted: true` for the app's
  lifetime. **Runtime-only**: the transform doesn't yet detect `{render}`
  object literals inside a real `m.route()` table (§6.5 only detects
  `view`-shaped components), so this currently only activates through
  `instrument()`/the public `inspectComponent()` API directly, not
  automatically for an app's actual route table — a follow-up transform
  change.
- **`function`** — declared in the protocol type but the runtime cannot
  currently produce it. A bare `function Foo() { return {view} }`
  *declaration* is fundamentally unwrappable from the runtime alone: the
  transform's `__miComponent` registration call for a declaration discards its
  return (the binding can't be rebound), and there's no way to intercept calls
  to the original, un-rebound reference without either global-`m`
  interception (forbidden, ADR-005) or a transform-side call-site rewrite (out
  of scope for a runtime-only task). No heuristic distinguishes this from a
  `const Foo = () => {...}` closure expression at the point `instrument()`
  receives a bare function reference — both can carry a `.name`. Its own `m(...)`
  element picking still works via `source()`; only instance-level tracking is
  affected.

`childIds` is rebuilt in current render order on every flush (not creation
order — ADR-103's own flagged follow-up), and `markInspectorHidden` (§14)
excludes a component and its whole subtree from `recordOf`/`componentsSnapshot`/
`resolveDomComponent` (filtered at read time, since hiding can be toggled
independently of when a component was instrumented).

## Known Phase 1/2 limitations

- Function-*declaration* closures are permanently untracked at the instance
  level (see `kind: "function"` above); their source-level picking still
  works.
- Route-resolver tracking is runtime-only pending a transform change (see
  `kind: "route-resolver"` above).
- `mode: "full"` is scaffolding — identical to `"components"` today; attrs,
  state and diagnostics (§17 `full` definition) arrive with safe serialization
  (0020).
- `inspectSource` and per-node vnode ids in `getSnapshot` are placeholders for
  later phases.
- `mode: "components"`'s §17 "<20% median redraw overhead" target is
  **unconfirmed at scale**: an ad hoc spot-check (task 0017 Agent Notes)
  measured ~12% overhead on a small synthetic tree (64 components) but ~30%
  on a larger one (~4096 components) — not yet profiled to find the actual
  cost driver. Worth a real profiling pass before 0019/0022 add more
  per-flush work on top of this layer.
