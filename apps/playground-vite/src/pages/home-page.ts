import m from "mithril"
import type { Component } from "mithril"

import { Counter } from "./counter.js"
import { Greeting } from "./greeting.js"

/** Nests two other components (§19.2 "simple mounted component" + "nested components"). */
export const HomePage: Component = {
  view: () =>
    m("div#home-page.page", [
      m(Greeting),
      m("p", "This playground exercises every inspector fixture scenario from REQUIREMENTS.md §19.2."),
      m(Counter),
    ]),
}
