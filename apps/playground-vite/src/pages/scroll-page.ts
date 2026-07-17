import m from "mithril"
import type { Component } from "mithril"

const rows = Array.from({ length: 60 }, (_, i) => `Row ${i + 1}`)

/** A tall, internally-scrollable container (§19.2 "scrolling content"). */
export const ScrollPage: Component = {
  view: () =>
    m("div#scroll-page.page", [
      m("h2", "Scrolling content"),
      m(
        "div#scroll-container",
        { style: "height: 240px; overflow-y: auto; border: 1px solid #ccc;" },
        rows.map((row, i) => m("p.scroll-row", { id: `scroll-row-${i}` }, row)),
      ),
    ]),
}
