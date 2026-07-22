# @mithril-inspector/runtime

Runtime registration, component tracking, vnode ownership and DOM/source
association for Mithril Inspector. No UI, and no Vite or
bundler dependencies (ADR-004) — the only dependency is
`@mithril-inspector/protocol`. It composes the mechanisms validated by the
Phase 0 spikes: vnode→DOM association (ADR-101), fragment-root components
(ADR-104), lifecycle hook composition (ADR-105), component-instance tracking
(ADR-103) and HMR mapping survival (ADR-106).

Phase 1 shipped the `"source"` mode: an element-to-source registry plus
DOM/source association so the overlay can resolve a hovered DOM node to its
original source location. Task 0017 (Phase 2) adds mounted component-instance
IDs and parent-child tracking (`ComponentRecord`) behind the `mode`
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
// in a WeakMap, never in enumerable attrs):
__miSource("m:<hash>:s2", m("article.user-card", …))

// Around every component definition (returns the instrumented definition):
export const UserCard = __miComponent("m:<hash>:s1", { view: … })
```

## Global hook

The runtime installs a single dev-only hook at `window.__MITHRIL_INSPECTOR__`
(protocol version 1) exposing the standard
`registerModule` / `registerComponent` / `registerVNode` / `associateDom` /
`disposeVNode` / `subscribe` / `getSnapshot` methods, plus a richer resolution
API the overlay uses:

```ts
import { getInspectorHook } from "@mithril-inspector/runtime"

const hook = getInspectorHook()
hook.resolveDomSource(node)     // nearest SourceLocation for a DOM node, or null
hook.resolveDomComponent(node)  // nearest ComponentId owning a DOM node, or null
hook.sourceOfVnode(vnode)       // source stamped on a specific vnode, or null
hook.excludeHost(overlayHost)   // keep the overlay host out of tracking
hook.setMode("source")          // "source" | "components" | "full" (see "Modes" below)
hook.invalidateModule("m:…")    // drop a module's stale sources on HMR (ADR-106)
hook.getRedactionConfig()       // resolved { keys, replacement } policy
hook.getSnapshot()              // { components, vnodes, modules, domAssociations }
```

## Configuration (`createRuntime`)

An adapter bootstrap creates the singleton with `createRuntime(options)` before
any module registers. Beyond `mode`/`debug`, two options are wired from the
adapter:

```ts
createRuntime({
  mode: "source",
  exposeDomAttributes: true,  // add a compact, path-free data-mi="m:<hash>:s2"
                               // attr to element vnodes (off by default)
  redact: { keys: ["password"], replacement: "[redacted]" }, // redaction policy
})
```

`invalidateModule` is the pre-HMR step: the adapter's `handleHotUpdate` calls it
so the module's stale source table is dropped, and the re-executed module's own
`registerModule` restores a fresh one (ADR-106).

Associations are batched on a microtask after each render pass; call
`hook.flush()` to force one synchronously. All node/vnode/state keys are held
weakly, and instance records are cleaned when a component unmounts. Every
entry point runs inside an error boundary: a failure is caught, the host render
is never broken, and a repeatedly-failing feature disables itself.

## Public API

For application patterns the transform cannot reach:

```ts
import {
  inspectComponent,        // instrument a component explicitly (functional)
  setInspectorDisplayName, // override a component's display name (functional)
  defineInspectorName,     // alias of setInspectorDisplayName
  markInspectorHidden,     // hide a component from the tree
  setInspectorSerializer,  // attach an attrs/state redaction serializer
  inspectSource,           // reserved; returns the vnode unchanged in Phase 1
} from "@mithril-inspector/runtime"
```

## Display name resolution (task 0018)

`ComponentRecord.displayName` resolves strictly in this order, stopping at the
first tier that produces a name:

1. an explicit inspector name (`setInspectorDisplayName`/`defineInspectorName`);
2. `component.displayName`;
3. the variable/export name the transform discovered for the declaration
   (carried in `SourceLocation.displayName`);
4. the class name;
5. the function name;
6. a filename-derived name (the component's source file's basename, extension
   stripped — e.g. `src/Page.tsx` → `"Page"`);
7. `"Anonymous"`.

`ComponentRecord.displayNameInferred` is `true` for tiers 6–7 and `false`
otherwise, so the overlay can mark a guessed name as inferred
instead of presenting it as authoritative. Resolution reads live from the
source registry on every call (never cached on the instance record), so a
renamed declaration takes effect immediately after HMR re-registers its
module (ADR-106) — no re-instrumentation needed.

## Modes (task 0017)

```ts
mode: "source"      // default — element/source mapping and editor navigation only
mode: "components"  // + component-instance tracking: class and route-resolver
                     //   kinds, render-ordered childIds (see below)
mode: "full"         // + render-duration tracking and slow-render warnings
                     //   (task 0029; see below)
```

Object and closure component instance-tracking (nearest-component lookup,
parent/child linkage) predates this gate — it was pulled forward into
`"source"` for the 0.1.0-alpha.1 release (task 0016) to support hover/basic
ancestry and stays unconditional in every mode, so it does
not regress. `mode: "components"`/`"full"` *additionally* activate class and
route-resolver tracking, which task 0017 introduced already gated (there was
no earlier alpha behavior to preserve for those two kinds).

## Component instance tracking (task 0017)

`ComponentRegistry.instrument()` (internal; driven by the transform's
`__miComponent`) tracks these `ComponentRecord.kind` values:

- **`object`** / **`closure`** — always tracked, any mode (see above).
- **`anonymous`** — an `object`-shaped inline component with no discoverable
  name at all; a read-time refinement, not a separate wrap path.
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
  object literals inside a real `m.route()` table (only `view`-shaped
  components are detected today), so this currently only activates through
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
order — ADR-103's own flagged follow-up), and `markInspectorHidden`
excludes a component and its whole subtree from `recordOf`/`componentsSnapshot`/
`resolveDomComponent` (filtered at read time, since hiding can be toggled
independently of when a component was instrumented).

`ComponentRecord.key` (task 0022, e.g. `UserCard key="42"`) is the
instance's vnode `key` attribute (`string | number`), or `null` when unkeyed —
read straight off the `latestVnode` recorded at allocation/flush time, never
recomputed or cached separately. A vnode's key is stable for the instance's
whole lifetime (Mithril only reuses a `state` object across renders when the
key matches; a changed key allocates a new instance instead), so unlike
`domRange`/`childIds` it's never repatched via `ComponentPatch`.

## Render-duration tracking and slow-render warnings (task 0029)

In `mode: "full"` only, `ComponentRecord.renderDuration` is the most recent
`view()`/route-resolver `render()` call's own wall-clock duration in
milliseconds, and `slowRenderCount` is the cumulative count of renders whose
duration exceeded `RuntimeOptions.slowRenderThresholdMs` (default `16` — one
60fps frame budget). Both stay `null`/`0` in `"source"`/`"components"` mode:
the two `performance.now()` calls this needs are skipped entirely there, so
the feature costs nothing outside `full` mode (opt-in, off by default).

The measurement brackets only the application's own `view.call`/`render.call`
— nothing a descendant component's own `view()` does, and nothing the
inspector's own bookkeeping (`recordOwnedVnodes`) does either. This isolation
falls out of Mithril's own render order rather than needing any extra
subtraction: Mithril calls a component's `view()` to get its returned vnode
tree, and only *afterward* — while walking that returned tree during the same
render pass — does it call a child component vnode's own `view()`. So a
child's `view()` call happens strictly after the parent's `view()` call has
already returned its own stack frame, never nested inside it; a slow child
never inflates its ancestors' `renderDuration` numbers, and each component's
number reflects only its own function body's cost (see
`components.test.ts`'s "isolates each component's own render duration from
its descendants'" test for this proved against real Mithril rendering, not
just asserted).

Injectable via `RuntimeOptions.perfNow` (default `performance.now`) for
deterministic tests, mirroring `RuntimeOptions.now`'s existing pattern for
`createdAt`/`updatedAt`.

## Ancestry and component-view source (task 0019)

`ComponentRegistry.ancestryOf(id)` returns the root-first ancestor chain for a
mounted instance, including the instance itself as the last entry. It's
consistent with `recordOf`'s hidden-subtree exclusion: a component inside a
hidden ancestor's subtree is itself not visible (`isVisible` already walks the
whole chain checking every hidden flag), so its ancestry is `[]` rather than a
chain with a gap where the hidden ancestor would have been.

`ComponentRegistry.viewSourceOf(id)` resolves a component's `component-view`
source location (the "component view" open target, distinct from the
`component-declaration` location already on `ComponentRecord.source`). The
transform's `addComponent` always registers a component's
`component-view` marker as the source id immediately following its
`component-declaration` marker when the view has its own span; `viewSourceOf`
derives that adjacent id from the instance's `qualifiedId` and returns the
location only if its `kind` actually is `"component-view"` (self-verifying —
degrades to `null` rather than guessing when no such marker exists, e.g. an
inline component with no `qualifiedId`, or a declaration with no separately
spanned view).

Both are exposed on `InspectorRuntime` as `componentAncestry`/
`componentViewSource` and consumed by the overlay's ancestry panel and
"Reveal component" action, which additionally resolves the
*rendered element*'s own exact mapping (`resolveDomSource` on the component's
`domRange.first`) as the third and generally most-precise open target.

## Batched runtime events (task 0021)

`subscribe(listener)` delivers coalesced `RuntimeEvent`s on every `flush()` —
one notification per event type per flush, never one per changed record:

```ts
type RuntimeEvent =
  | { type: "components-added"; records: ComponentRecord[] }
  | { type: "components-updated"; records: ComponentPatch[] }
  | { type: "components-removed"; ids: ComponentId[] }
  | { type: "dom-associated"; records: DomAssociation[] }
  | { type: "reset" }
```

- **`components-added`** / **`components-removed`** — an instance allocated or
  cleaned up this batch (task 0017 registry, unchanged by this task).
- **`components-updated`** carries a `ComponentPatch` per instance whose
  `updateCount` was bumped this batch (an `onupdate` firing, or — since a
  route-resolver has no `onupdate`-equivalent hook — a repeated `render()`
  call on an already-allocated resolver). `id`/`updateCount`/`updatedAt`/
  `renderDuration`/`slowRenderCount` (task 0029, see below) are always
  present; `domRange`/`childIds` are included only when they actually changed
  since the last emitted record for that instance (no full-record
  spam) — `attrs`/`state` are deliberately never pushed through this stream,
  consistent with the lazy, pull-based `attrsPreview`/`statePreview` (task
  0020). An instance also added or removed within the same batch (e.g. two
  redraws before one flush) is reported once, via
  `components-added`/`components-removed`, not additionally here.
- **`dom-associated`** carries one `DomAssociation` per node (re)tagged by
  `source()` this flush, covering every node in a single event regardless of
  how many were touched. Skipped entirely (not even built) when nobody is
  subscribed, since resolving each node's nearest source/component is real,
  measured cost with no other consumer.
- **`reset`** signals a full invalidation — the subscriber should discard
  everything and re-derive from a fresh `getSnapshot()`. Emitted by
  `resetTracking()` (below) and, if a subscriber is already listening, by the
  error boundary when a repeatedly-failing feature disables itself. A
  `reset` fired with **no subscriber currently attached** is not silently
  dropped — it is delivered to whichever listener calls `subscribe()` next
  (a later subscriber does not also receive it).

`resetTracking()` clears all component and DOM-association tracking and emits
`reset` per the rule above. It is the primitive for two scenarios:

- **HMR full-invalidation** — a caller-driven reset an adapter can call from a
  real "the whole module graph was invalidated" hook. Wiring an actual Vite
  call site is a follow-up (this task is runtime-only, matching how task 0017
  left route-resolver transform detection as a follow-up); ordinary per-file
  HMR (ADR-106) does **not** call this — it produces normal
  `components-added`/`components-removed` pairs as instances naturally
  remount.
- **Multiple-runtime detection** — `getRuntime()` calls it on the runtime it
  installs when it finds an *incompatible* existing hook already at
  `window.__MITHRIL_INSPECTOR__` (a protocol-version mismatch — two different
  bundled copies of the inspector). It also logs a `console.warn` diagnostic
  and never touches the existing hook beyond reading its `protocolVersion`
  (its shape is untrusted). A *compatible*-version existing hook is
  still reused silently, as before (task 0016).

**Known caveat**: `resetTracking()` drops bookkeeping for still-mounted
instances too. An instance that stays mounted across a reset without any
redraw touching it again before it's read (e.g. `getSnapshot()`) simply
appears absent until its `view`/`render` next runs, at which point it is
reallocated with a fresh `ComponentId` and reported via `components-added` —
by design (a reset is a deliberate "start over" signal, and re-adoption
avoids the alternative of leaking every pre-reset instance's bookkeeping
forever via an unclearable `WeakMap`).

`getSnapshot()` and the event stream stay consistent for a subscriber that
attaches mid-session: `getSnapshot()` reflects every currently-live instance
regardless of when it was added, and subsequent events report only what
changes *after* that point — an already-known instance is never re-announced
as added, and a later removal is still delivered.

## Safe serializer and redaction (task 0020)

`ComponentRecord.attrs`/`.state` are raw, read-only references — never
display them directly. `InspectorRuntime` exposes a lazy, privacy-aware
preview instead:

```ts
hook.attrsPreview(id)   // PreviewNode | null — the instance's attrs
hook.statePreview(id)   // PreviewNode | null — the instance's state
hook.expandPreview(id, "attrs", path, { offset? }) // evaluate a getter, page
                                                    // a truncated container, or
                                                    // expand past a max-depth stub
```

A `PreviewNode` (`@mithril-inspector/protocol`) is a serializable, discriminated
tree — never the live object — safe to hand to the overlay: `primitive`,
`bigint`, `symbol`, `function`, `dom-node`, `error`, `promise`, `array`,
`object`, `map`, `set`, `typed-array`, `getter` (a deferred accessor — the UI
shows a `(...)` affordance and calls `expandPreview` with its `path` to
evaluate it, wrapped in try/catch so a throwing getter never breaks the
preview), `circular` (a back-reference to an ancestor already on the current
path), `redacted`, and `max-depth` (a container past the initial depth budget).
Containers carry `offset`/`truncated` so a large collection pages through
`maxEntries` at a time instead of serializing everything eagerly. Proxies need
no special handling: every property read (not just declared getters) is
wrapped in try/catch, so a throwing trap surfaces as an inline `error` node
instead of propagating.

`createSerializer` (`./serializer.ts`) is the underlying pure builder, usable
standalone:

```ts
const serializer = createSerializer({
  maxDepth: 3,        // default DEFAULT_MAX_DEPTH
  maxEntries: 50,      // default DEFAULT_MAX_ENTRIES
  redactKeys: [...],   // default DEFAULT_REDACTION_KEYS when omitted/empty
  replacement: "[redacted]",
})
serializer.serialize(value)
serializer.expand(root, path, { offset })
```

Redaction matches a property key (or a `Map`'s own string key) case-
insensitively against a substring pattern list — the same semantics as the requirements doc's
unanchored `/password/i` example. `DEFAULT_REDACTION_KEYS` (password, passwd,
secret, token, authorization, cookie, apiKey, accessToken, refreshToken) is
always the effective list unless `RuntimeOptions.redact.keys` (or
`SerializerOptions.redactKeys`) is non-empty, in which case it *replaces* the
defaults (matching the adapter's own already-shipped replace semantics, task
0013) — an intentionally non-bypassable safety net: even a custom
`setInspectorSerializer` hook's output still passes through key-pattern
redaction, and `expandPreview` refuses to walk through a redacted key (no
getter-triggered back door). A redacted key's getter is never invoked, and
its value is never read at all.

`setInspectorSerializer(def, { attrs?, state? })` runs before the safe
serializer: its return value becomes the input to `attrsPreview`/
`statePreview` for instances of that definition. A throwing hook falls back
to the raw value rather than breaking the preview.

## Known Phase 1/2 limitations

- Function-*declaration* closures are permanently untracked at the instance
  level (see `kind: "function"` above); their source-level picking still
  works.
- Route-resolver tracking is runtime-only pending a transform change (see
  `kind: "route-resolver"` above).
- `mode: "full"` additionally activates render-duration tracking and
  slow-render warnings (task 0029, see above) on top of
  everything `"components"` does. Redraw-flash visualization, per-render
  timing beyond the single most-recent value, and route inspection (the rest
  of the remaining Phase 5 diagnostics list, see `TASKS/0026`) remain
  unscoped follow-ups. Safe attrs/state serialization itself (task 0020, see
  above) does not depend on `mode` — `attrsPreview`/`statePreview` work for
  any tracked instance.
- `inspectSource` and per-node vnode ids in `getSnapshot` are placeholders for
  later phases.
- `mode: "components"`'s "<20% median redraw overhead" target is
  **unconfirmed at scale**: an ad hoc spot-check (task 0017 Agent Notes)
  measured ~12% overhead on a small synthetic tree (64 components) but ~30%
  on a larger one (~4096 components) — not yet profiled to find the actual
  cost driver. Worth a real profiling pass before 0019/0022 add more
  per-flush work on top of this layer.
- Task 0021's `dom-associated` event construction (one `resolveDomComponent` +
  one `resolveDomSource` ancestor-walk per associated node, every flush with
  an active subscriber) is a real, measured addition to redraw cost. A small
  synthetic spot-check (85 components, source-tagging every element, an
  active no-op subscriber) measured `"source"` mode's overhead *against a bare
  `m.render` with no runtime at all* going from ~113% to ~185% after this
  task — i.e. this specific micro-benchmark's absolute cost was already far
  past the "<10%" framing *before* this task (a pre-existing characteristic
  of `source()`'s tagging + association-map rebuild, not introduced here) and
  grew further because of it. The mode-relative comparison this
  task's acceptance criteria actually asks for (`"components"`/`"full"` vs
  `"source"`, the same methodology task 0017 used) stayed inside the 20%
  budget across repeated runs (roughly 5-19% for `"components"`, 10-13% for
  `"full"`). The one cheap mitigation applied: the whole `dom-associated`
  payload is skipped when `subscribers.size === 0` (identical behavior, since
  an event with no listener is already a no-op) — real headroom remains by
  resolving source/component identity from `domAssoc.flush()`'s own
  per-node tag registration instead of a separate post-hoc ancestor walk, not
  attempted here to keep this task's change surface bounded. Flagging
  honestly per task 0017's own precedent rather than either hiding it or
  blocking indefinitely on a deeper fix.
