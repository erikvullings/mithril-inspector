import m from "mithril"
import type { Component } from "mithril"

/**
 * Fragment-root component: the view returns an array of top-level vnodes with
 * no wrapping element (§19.2 "fragment roots", ADR-104).
 */
export const FragmentScene: Component = {
  view: () => [m("p#frag-a.frag-item", "Fragment A"), m("p#frag-b.frag-item", "Fragment B")],
}
