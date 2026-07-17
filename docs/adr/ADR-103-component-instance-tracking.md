# ADR-103: Component instance tracking

Status: accepted (validated by spike, TASKS/0004)
Date: 2026-07-15
Related: REQUIREMENTS.md §2.3, §6.5, §7.2, §7.5, §7.7; ADR-005, ADR-101

## Context

Phase 2 needs a stable `ComponentId` for every mounted component instance and
the parent/child relationships between them (§7.2, §7.5) — without replacing
or mutating `vnode.state`, mutating application attrs, or altering lifecycle
ordering (§2.3, §7.7). The mechanism must cover object, closure and class
components (§6.5) and must not rely on globally patching `m` (ADR-005). The
open questions were which object is a stable identity carrier across redraws,
and where the runtime can intercept a component's view without touching
application objects.

## Decision

The prototype in `tests/fixtures/spikes/component-instance-tracking/`
validates this mechanism against real `m.render` passes (Mithril 2.3.8,
jsdom):

1. **Carrier: `WeakMap<object, record>` keyed on `vnode.state`.** Mithril
   recreates the component vnode on every redraw but carries the state object
   over (`vnode.state = old.state` in `updateNode`), so the state object —
   `Object.create(component)` for object components, the factory's returned
   object for closures, the class instance for classes — is the one stable
   per-instance identity for all three §6.5 forms. Keying a `WeakMap` neither
   mutates nor retains it.
2. **Interception: view-boundary wrapper injected at the definition site.**
   The build-time transform emits `__miView(declId, view)` (spike stand-in:
   `instrumentView`) around the view *where it is defined*: the `view:` value
   of an object-component literal, the `view:` value of the object a closure
   returns, and a class's prototype method. Because the emitted code *is* the
   application code, no component object, state object or attrs object is
   ever mutated at runtime; the wrapper calls the original view with the
   original `this`, arguments and return value, and Mithril's own `checkState`
   guard keeps enforcing state identity around every call.
3. **Instance records.** The wrapper resolves the record for `vnode.state` on
   each call, allocating a fresh `c:${n}` id on the first view call of an
   instance. Instances are distinguished purely by state identity, so
   multiple application roots — even mounting the same component object —
   cannot confuse the registry (§3.1).
4. **Parent/child via §7.5 ownership scopes.** The wrapper runs
   `enterComponent` / `leaveComponent` around the original view; after it
   returns, `recordOwnedVnodes` walks the raw view result and tags every
   component vnode in it with the current scope in a
   `WeakMap<vnode, record>`. When that child instance's own view first runs,
   the vnode Mithril hands it is the tagged object, so the child resolves its
   `parentId` from the tag. First tagger wins: a wrapper re-emitting
   `vnode.children` inside its own result does not steal ownership from the
   lexical creator (§7.5).

## Verified Mithril 2.3.8 behaviors

- `updateNode` assigns `vnode.state = old.state`; the vnode object itself is
  new every redraw, so the vnode is not a usable carrier — the state is.
- The view is re-resolved from `vnode.state.view` on every pass and invoked
  via `callHook` with `this = vnode.state`; replacing `vnode.state` anywhere
  would make Mithril itself throw (`checkState`).
- Wrapping only the view leaves lifecycle behavior byte-for-byte identical to
  an uninstrumented component: `oninit → view → oncreate`,
  `onbeforeupdate → view → onupdate`, `onbeforeupdate` returning `false`
  skips both the view call and `onupdate`, and an async `onbeforeremove`
  keeps the DOM attached until it resolves, then `onremove` fires — all with
  original `this` and return values (proven by log parity with an
  uninstrumented run).
- Keyed redraws move state objects with their keys, so ids stay attached to
  the right instances across reorder, insertion and removal; moved closures
  keep their captured state.
- Mithril's `$$reentrantLock$$` sentinel lands on the resolved view function
  (the wrapper) or the factory, preserving per-declaration reentrancy
  semantics.

## Rejected alternatives

- **Lifecycle injection.** Adding hooks to `vnode.state` replaces or mutates
  the state object; adding them to `vnode.attrs` mutates application attrs
  and is enumerable by application code — both forbidden by §2.3. Neither
  provides the view boundary §7.5 requires for ownership scopes. Composing
  *additional* hooks safely remains task 0006's subject, for association
  timing and removal cleanup — not for identity.
- **Runtime wrapping of the component object** (spread copy, `Object.create`
  facade, or a `Proxy` around the state). Breaks `vnode.tag` identity (keyed
  diffing and `onbeforeupdate` short-circuits compare tags) or `vnode.state`
  identity (`checkState` throws; §2.3 forbids it anyway).
- **`WeakMap` keyed on the vnode.** Verified unstable: every redraw produces
  a fresh component vnode.
- **Global monkey-patch of `m` with a render stack.** Rejected by ADR-005;
  additionally, parent views return before child views run, so a plain call
  stack cannot recover component ancestry at all.

## Constraints and follow-ups

- Wrapping must happen at build time at the definition site. Components in
  untransformed dependencies get no instance record; only their usage site is
  instrumented (§6.5), and the UI must present them as inferred (§2.4).
- Ownership is lexical (the view that created the vnode). The render-tree
  parent can differ when component vnodes are passed through another
  component's children; a component vnode arriving via attrs is untagged
  until the embedding view emits it, which then becomes its owner. Task 0017
  must decide which relation the §9.1 tree shows and can derive render-tree
  parents from the rendered-tree walk of ADR-101.
- Id allocation is lazy: the record exists only from the instance's first
  view call, so `oninit` of the very first render precedes it. Task 0021's
  tree events must batch after the render pass, where this is invisible.
- The spike's `Map<ComponentId, record>` retains records for removed
  instances (useful for stale-selection UX, §8.8) and `childIds` is
  creation-ordered, not render-ordered. Removal cleanup (§7.7) is now composed
  by ADR-105's `onremove` wrapper (task 0006); tree ordering remains task 0017.
- Verified on Mithril 2.3.8 only; the `vnode.state` carryover contract
  should be re-checked when bumping the supported Mithril range.

## Production implementation (task 0017)

The runtime (`packages/runtime/src/components.ts`) carries this spike's
mechanism forward with one correction and two extensions, plus resolves the
open follow-ups above.

- **Class components: mutation, not reassignment.** The spike's write-up
  above says "wrapping must happen at build time" and ADR-105 calls the class
  mechanism "a prototype facade... applied to... a prototype facade" without
  pinning down *how*. The production implementation tried reassigning
  `Klass.prototype` to a fresh `Object.create(originalPrototype)` facade
  first (matching the object/closure `Object.create(app)` pattern one level
  up) — this **fails**: a `class` constructor's `.prototype` property is
  non-writable in strict mode (unlike a plain `function`), so the assignment
  throws. The actual mechanism: snapshot the original `view`/hooks into a
  plain object, build the same composed wrapper `composeHooks` already
  produces for object/closure (delegating to that snapshot, not to the live
  prototype — avoiding self-recursion), and copy its own properties directly
  onto the *existing* prototype object as own-property overwrites. This still
  needs no `vnode.state` carrier changes and preserves `instanceof`/
  `.constructor` (only specific methods are overwritten, not the prototype
  chain itself), but it is more invasive than the object/closure path: it
  mutates an object the application's own code still holds a reference to,
  rather than returning an untouched-original-plus-new-facade pair. This is
  unavoidable for a declaration-form binding the transform can't rebind.
- **`childIds` render order resolved.** The flush-time rendered-tree walk
  (ADR-101's `visitForOwnership`) now threads the current parent through its
  recursion and rebuilds each visited parent's `childIds` fresh on every
  flush, replacing the creation-order array this ADR flagged. Parent*id*
  linkage stays lexical (per this ADR's existing decision); only the
  *ordering* of `childIds` changed, from creation order to current render
  order.
- **Route-resolvers added as a same-pattern extension.** An `m.route()` table
  entry shaped `{ render, onmatch? }` has no `vnode.state` of its own — Mithril
  calls `resolver.render(vnode)` as a plain method (confirmed against
  `mithril/api/router.js`), so the wrapped resolver object itself (`this` at
  call time) is the identity carrier, allocated lazily as a root instance
  (parentId `null`) since nothing lexically owns it. This is runtime-only:
  the transform doesn't detect `{render}` shapes in a real route table (§6.5
  scope), so it activates via `instrument()`/`inspectComponent()` directly,
  not automatically for an app's actual routes yet.
- **Hidden-subtree exclusion (§14) filters at the read boundary**, not at
  wrap time — `markInspectorHidden` can be called before or after
  `instrument()` ran for the same definition, so wrap-time gating can't
  reliably see it. Instances stay uniformly tracked; `recordOf`,
  `componentsSnapshot` and `resolveDomComponent` skip a hidden instance and
  everything transitively owned by it.
- **Mode gating (§17).** Object/closure tracking predates the mode gate — it
  was pulled forward into the default `"source"` mode for the 0.1.0-alpha.1
  release (task 0016) and stays unconditional so that release doesn't
  regress. `mode: "components"`/`"full"` gate only the *new* kinds this task
  adds (class, route-resolver), which had no earlier shipped behavior to
  preserve.
