import m from "mithril"
import type { Component } from "mithril"

/** CSS-transformed elements (§19.2 "CSS transforms") exercise the highlight overlay's geometry math. */
export const TransformPage: Component = {
  view: () =>
    m("div#transform-page.page", [
      m("h2", "CSS transforms"),
      m(
        "div.transform-box#transform-rotate",
        { style: "transform: rotate(12deg); display: inline-block; padding: 1rem; background: #eef;" },
        "Rotated box",
      ),
      m(
        "div.transform-box#transform-scale",
        { style: "transform: scale(1.4); display: inline-block; padding: 1rem; background: #efe;" },
        "Scaled box",
      ),
      m(
        "div.transform-box#transform-translate",
        { style: "transform: translate(20px, 10px); display: inline-block; padding: 1rem; background: #fee;" },
        "Translated box",
      ),
    ]),
}
