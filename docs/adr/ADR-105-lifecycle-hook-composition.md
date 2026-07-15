# ADR-105: Lifecycle hook composition

Status: accepted (validated by spike, TASKS/0006)
Date: 2026-07-15
Related: REQUIREMENTS.md §2.3, §7.5, §7.6, §7.7, §8.8, §20; ADR-101, ADR-103, ADR-104

## Context

The runtime must run its own logic inside Mithril's six lifecycle hooks
(`oninit`, `oncreate`, `onbeforeupdate`, `onupdate`, `onbeforeremove`,
`onremove`) with no observable change to the application (§7.7): existing hooks
must still run with the right `this`, arguments, return value and ordering;
exceptions must propagate unchanged; `vnode.state` must not be modified; the
inspector's mappings must be cleaned on removal; and an async `onbeforeremove`
must still delay detachment. Instrumentation must also never veto an update or
schedule an extra redraw (§2.3). Hooks can live on the component definition
*and* on the vnode's attrs, and both must keep working. This spike decides
*where* to compose the inspector's hooks and proves the composition against
real `m.render` passes (Mithril 2.3.8, jsdom).

## Decision

Compose on the **component definition**, at the transform's definition site —
the same boundary ADR-103/104 already use to wrap `view`. `instrumentComponent`
in `tests/fixtures/spikes/lifecycle-hook-composition/` returns a *fresh*
component object (the original is never mutated) whose `view` and all six hooks
are wrapped; each wrapper:

1. **Delegates to the application hook** captured from the original definition,
   via `app.hook.call(this, ...args)`. Because Mithril invokes a component
   hook as `callHook.call(vnode.state.hook, …)` with `this === vnode.state`,
   and for a POJO component `vnode.state = Object.create(definition)`, the
   inherited wrapper runs with `this === vnode.state` and forwards that same
   `this` — and the exact arguments (`(vnode)`, or `(vnode, old)` for
   `onbeforeupdate`) — to the application hook. `this`, arguments and return
   value are preserved.
2. **Adds no control-flow of its own** to `onbeforeupdate` and `onbeforeremove`.
   They are pure pass-throughs: they return the application's value verbatim, or
   `undefined` when the application has no such hook. A wrapper that always
   exists but returns `undefined` is behaviourally identical to no hook —
   Mithril treats `undefined` from `onbeforeupdate` as "proceed" and a nullish
   `onbeforeremove` result as "no delay" — so the inspector can never veto an
   update or stall a removal (§2.3).
3. **Never swallows exceptions.** Delegation is a direct `return app.hook.call`,
   so a throw propagates unchanged. `onremove` wraps its delegation in
   `try { … } finally { cleanup }` so mapping cleanup runs whether or not the
   application hook threw, and the original exception still surfaces.
4. **Cleans mappings in `onremove`, not earlier.** `oncreate`/`onupdate` capture
   the instance's current top-level DOM nodes and vnode (its `DomRange`, read
   from Mithril's own `dom`/`domSize` exactly as ADR-101/104 do). `onremove`
   deletes the strong `Map<ComponentId, record>` entry and releases the captured
   nodes/vnode. Because Mithril calls `onremove` only *after* an async
   `onbeforeremove` promise resolves, the mapping is retained throughout the
   deferred window (stale-selection UX, §8.8) and cleaned exactly when the DOM
   actually detaches.

Application **attrs hooks compose for free**: Mithril calls the state
(definition) hook and the attrs hook independently for a component vnode
(`initLifecycle(vnode.state, …)` then `initLifecycle(vnode.attrs, …)`; the same
pairing for update, removal and `onremove`). The inspector only touches the
definition path, so `m(Component, { oncreate, onremove })` attrs hooks keep
firing untouched, in Mithril's order (definition before attrs).

Identity is keyed on `vnode.state` (ADR-103): the wrappers allocate/resolve the
record lazily via `vnode.state`, so it is stable across redraws and shared by
this instance's every rendered node. `oninit` now allocates the record too, so —
unlike the view-only allocation of ADR-103 — the record exists from `oninit`
onward.

## Verified Mithril 2.3.8 behaviors

- A component hook is dispatched as `callHook.call(vnode.state.hook, vnode)`
  with `this === vnode.state`; `checkState` throws if a hook reassigns
  `vnode.state`. The wrappers never touch it, so a redraw succeeds and the state
  object gains no inspector own-properties.
- For a component vnode, **both** `vnode.state` and `vnode.attrs` hooks are
  called for init, create, update, `onbeforeupdate`, `onbeforeremove` and
  `onremove` — state first, then attrs (`onbeforeupdate` checks attrs first).
- `onbeforeupdate` returning a defined `false` (from either source) makes
  Mithril skip the diff and keep the old DOM; the wrapper forwards that `false`
  and the update is skipped; a later `true`/`undefined` lets it through.
- `onbeforeremove` returning a promise keeps the vnode's DOM attached until the
  promise resolves; `onremove` and detachment run only afterward. A nullish
  return does not delay removal.
- Removal calls `onbeforeremove` then (post-resolution) `onremove`; both receive
  the last rendered vnode with `this === vnode.state`.
- An exception thrown by an application hook propagates out of `m.render`
  unchanged (verified by object identity).

## Rejected alternatives

- **Injecting hooks into `vnode.attrs`.** Mutates application attrs (enumerable,
  diffed, and forbidden by §2.3), requires intercepting every `m()` call, and an
  injected attrs `onbeforeupdate` is checked *before* the application's state
  hook — it could pre-empt the app's update decision. Rejected; also rejected in
  ADR-103.
- **Assigning hooks onto `vnode.state` at runtime.** `checkState` throws, and it
  would mutate the per-instance state object (§2.3).
- **Runtime `Proxy`/spread facade over the component object.** Breaks
  `vnode.tag` identity that keyed diffing and `onbeforeupdate` tag comparison
  rely on (ADR-103). Composition must happen on the definition the transform
  emits, not on a runtime clone.
- **Cleaning mappings in `onbeforeremove`.** Would drop the record during the
  deferred async-removal window, defeating stale-selection UX (§8.8) and
  discarding a still-mounted node's mapping. Cleanup belongs in `onremove`.
- **Wrapping only the hooks the application already defines.** Then a component
  with no `onremove` would never be cleaned, and no `oncreate` would leave the
  DomRange uncaptured. The inspector installs all six wrappers regardless;
  the no-op ones are behaviourally transparent.

## Limitations and follow-ups

- The spike wraps **POJO components**. Closure components (hooks on the object
  the factory returns) and class components (prototype methods) need the wrap
  applied to the factory's return / a prototype facade respectively; the
  transform (task 0009) emits the right form per definition shape, and the
  runtime (task 0010) composes hooks the same way once given the definition.
- Cleanup drops the **strong** `Map<ComponentId, record>` entry and captured
  nodes on removal; the `WeakMap<state, record>` may linger for stale-selection
  until GC (§8.8), and holds no DOM node, so it prevents no collection.
- Node capture here re-reads `dom`/`domSize` per create/update as a stand-in;
  the real runtime (task 0010) batches association after the render pass
  (ADR-104) rather than per-hook, and scopes registries per mount root.
- The wrappers add `oncreate`/`onupdate`/`onremove` where a component had none.
  This enqueues one extra `oncreate`/`onupdate` callback but reorders none of
  the application's own hooks and never calls `m.redraw`, so redraw scheduling
  is unchanged (§2.3); the spike asserts the view runs exactly once per pass.
- Verified on Mithril 2.3.8 only; the `callHook`/`checkState` contract and the
  state-vs-attrs dispatch pairing should be re-checked when the supported
  Mithril range changes.
