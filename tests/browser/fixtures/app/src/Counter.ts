import m from "mithril"
import type { Component, Vnode } from "mithril"

type CounterState = { count: number }

/**
 * Closure component with a real click handler (§19.2 assertion 9: overlay
 * interactions must not trigger this handler while the picker is active).
 * Written as `const X = () => ({ ... })` (not `function X() {...}`): only
 * that form is lifecycle-wrapped for instance tracking (runtime README
 * "Known Phase 1 limitations" — standalone function *declarations* are
 * registered for display-name resolution only), and the transform's own
 * closure-component detection (§6.5) requires the factory's `return` to be
 * an object *literal* — routing through an intermediate `self` variable
 * would go undetected. `count` lives on `vnode.state` (the same object this
 * literal becomes, per Mithril's `vnode.state = vnode.tag(vnode)` for
 * closures) rather than a closure-only variable, so the inspector's state
 * preview — and the State History tab (task 0027) built on it — has real,
 * non-empty state to snapshot instead of just an inherited `view`. Cast
 * (rather than a return-type annotation) so the excess-property check
 * doesn't reject `count` sitting alongside `view` — `Component`'s own type
 * only models the lifecycle hooks, not a closure's extra state fields; the
 * transform still sees a plain object literal through the cast (`as` is one
 * of the TS wrappers `unwrapExpression` strips, §6.5).
 */
export const Counter = () =>
  ({
    count: 0,
    view: (vnode: Vnode<Record<string, never>, CounterState>) =>
      m("div.counter", [
        m("span#counter-value", String(vnode.state.count)),
        m("button#counter-btn", { onclick: () => (vnode.state.count += 1) }, "Increment"),
      ]),
  }) as Component<Record<string, never>, CounterState> & CounterState
