import m from "mithril"
import type { Component } from "mithril"

/** Mounted into a second, independent `m.mount` root (§19.2 "multiple mount roots"). */
export const SecondRoot: Component = {
  view: () => m("section#second-root", m("h2#second-root-heading", "Second mount root")),
}
