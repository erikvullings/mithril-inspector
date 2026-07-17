import m from "mithril"
import type { Component } from "mithril"

/** Inline SVG shapes (§19.2 "SVG"). */
export const SvgPage: Component = {
  view: () =>
    m("div#svg-page.page", [
      m("h2", "SVG"),
      m("svg#demo-svg", { width: 200, height: 120, viewBox: "0 0 200 120" }, [
        m("rect#svg-rect", { x: 10, y: 10, width: 80, height: 60, fill: "#6a5acd" }),
        m("circle#svg-circle", { cx: 150, cy: 40, r: 30, fill: "#20b2aa" }),
        m("text#svg-text", { x: 20, y: 100 }, "SVG scene"),
      ]),
    ]),
}
