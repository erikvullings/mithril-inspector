import m from "mithril"

export const Nested = {
  view: () =>
    m("div.outer", m("div.middle", m("div.inner", [m("i", "a"), m("i", "b")])), m("footer")),
}
