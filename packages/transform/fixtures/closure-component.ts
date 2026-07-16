import m from "mithril"

export const Counter = () => {
  let count = 0

  return {
    view() {
      return m("button.counter", { onclick: () => (count += 1) }, count)
    },
  }
}
