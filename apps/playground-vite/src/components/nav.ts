import m from "mithril"
import type { Component } from "mithril"

import type { PageDef } from "../models.js"

interface NavAttrs {
  readonly pages: readonly PageDef[]
}

/** Closure component (§6.5): highlights the active route on every redraw. */
export const Nav = (): Component<NavAttrs> => {
  return {
    view: ({ attrs }) => {
      const current = m.route.get()
      return m(
        "nav.nav",
        m(
          "ul.nav-list",
          attrs.pages.map((page) =>
            m(
              "li.nav-item",
              { class: current === page.route ? "active" : "" },
              m("a", { href: `#!${page.route}`, id: `nav-${page.id}` }, page.title),
            ),
          ),
        ),
      )
    },
  }
}
