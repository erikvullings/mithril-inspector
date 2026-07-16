import m from "mithril"

const items = ["alpha", "beta", "gamma"]

export const KeyedList = {
  view: () => m("ul.keyed", items.map((item) => m("li", { key: item }, item))),
}
