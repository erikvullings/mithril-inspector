import m from "mithril"
import type { Component } from "mithril"

/**
 * Mounted independently of the router via a second `m.mount()` call in
 * main.ts (§19.2 "multiple mount roots").
 */
export const StatusWidget: Component = {
  view: () => m("div#status-widget.status-widget", ["Playground online ", m("span#status-dot", "●")]),
}
