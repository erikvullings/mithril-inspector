import m from "mithril"
import type { Component } from "mithril"

/** Fragment-root component (§19.2): the view returns an array with no wrapping element. */
export const FragmentPage: Component = {
  view: () => [
    m("h2#fragment-heading", "Fragment root"),
    m("p#fragment-a", "This paragraph and the next are top-level siblings with no wrapper element."),
    m("p#fragment-b", "Selecting either one should resolve to this same component."),
  ],
}
