import m from "mithril"

export const Trusted = {
  view: () => m("div.trusted", m.trust("<b>server rendered</b>")),
}
