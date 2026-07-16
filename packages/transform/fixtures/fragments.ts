import m from "mithril"

export const Frag = {
  view: () =>
    m.fragment({ key: "pair" }, [m("dt", "term"), m("dd", "definition")]),
}
