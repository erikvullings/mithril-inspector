import m from "mithril"
import type { Component } from "mithril"

/**
 * Closure component with a real click handler (§19.2 assertion 9: overlay
 * interactions must not trigger this handler while the picker is active).
 * Written as `const X = () => {...}` (not `function X() {...}`): only that
 * form is lifecycle-wrapped for instance tracking (runtime README "Known
 * Phase 1 limitations" — standalone function *declarations* are registered
 * for display-name resolution only).
 */
export const Counter = (): Component => {
  let count = 0

  return {
    view: () =>
      m("div.counter", [
        m("span#counter-value", String(count)),
        m("button#counter-btn", { onclick: () => (count += 1) }, "Increment"),
      ]),
  }
}
