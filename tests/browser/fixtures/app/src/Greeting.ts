import m from "mithril"
import type { Component } from "mithril"

/** Simple object component (§19.2 "simple mounted component"). */
export const Greeting: Component = {
  view: () => m("h1#greeting.greeting", "Hello, Inspector"),
}
