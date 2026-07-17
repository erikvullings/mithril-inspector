import m from "mithril"
import type { Component, VnodeDOM } from "mithril"

/**
 * Closure component (§6.5) that attaches its own shadow root, independent of
 * the inspector overlay's own shadow host (§19.2 "in-app shadow DOM", §8.2).
 */
export const ShadowDomPage = (): Component => {
  return {
    view: () =>
      m("div#shadow-dom-page.page", [
        m("h2", "In-app Shadow DOM"),
        m(
          "p",
          "The box below attaches its own open shadow root, separate from the inspector's overlay host.",
        ),
        m("div#shadow-host", {
          oncreate: (vnode: VnodeDOM) => {
            const host = vnode.dom as HTMLElement
            if (host.shadowRoot !== null) return
            const root = host.attachShadow({ mode: "open" })
            root.innerHTML = `
              <style>.shadow-box { padding: 1rem; border: 2px dashed #6a5acd; border-radius: 6px; }</style>
              <div class="shadow-box">
                <p id="shadow-text">Hello from inside a shadow root.</p>
                <button id="shadow-btn" type="button">Shadow button</button>
              </div>
            `
          },
        }),
      ]),
  }
}
