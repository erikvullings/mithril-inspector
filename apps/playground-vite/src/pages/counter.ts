import m from "mithril"
import type { Component } from "mithril"

/**
 * Closure component (§6.5) with a real click handler — used to manually
 * verify picker clicks are suppressed instead of triggering it (§19.2
 * assertion 9).
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
