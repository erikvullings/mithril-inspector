import m from "mithril"
import type { Component } from "mithril"

/** Renders raw HTML via `m.trust` (§19.2 "trusted HTML"). */
export const TrustedHtmlPage: Component = {
  view: () =>
    m("div#trusted-html-page.page", [
      m("h2", "Trusted HTML"),
      m.trust(
        '<section id="trusted-block"><p>This markup came from <code>m.trust(...)</code>.</p></section>',
      ),
    ]),
}
