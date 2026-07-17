import m from "mithril"
import type { Component } from "mithril"

import type { PageDef } from "../models.js"
import { Nav } from "./nav.js"

interface LayoutAttrs {
  readonly pages: readonly PageDef[]
}

/** Wraps every page in the shared nav (§19.2 "nested components"). */
export const Layout: Component<LayoutAttrs> = {
  view: ({ attrs, children }) =>
    m("div.layout", [m(Nav, { pages: attrs.pages }), m("main.page-content", children)]),
}
