import m from "mithril"

export class Widget {
  private label = "Widget"

  view() {
    return m("div.widget", m("span", this.label))
  }
}
