import m from "mithril"
import type { Component } from "mithril"

/** Plain object component (§6.5) — the simplest possible mounted component. */
export const Greeting: Component = {
  view: () => m("h1#greeting.greeting", "Hello from the Mithril Inspector playground"),
}
