import m from "mithril"
import type { Component } from "mithril"

/**
 * Set by `esbuild`'s `define` (scripts/dev.mjs vs. scripts/build.mjs) — a
 * statically-false condition here is dead-code-eliminated by esbuild, so the
 * `import("virtual:mithril-inspector/overlay")` below never reaches the
 * production bundle even though the plugin isn't run there either (§2.1).
 */
declare const __DEV__: boolean

/** Plain object component (§6.5) — the simplest possible mounted component. */
const Greeting: Component = {
  view: () => m("h1#greeting.greeting", "Hello from the Mithril Inspector esbuild playground"),
}

/**
 * Closure component (§6.5) with a real click handler — used to manually
 * verify picker clicks are suppressed instead of triggering it.
 */
const Counter = (): Component => {
  let count = 0

  return {
    view: () =>
      m("div.counter", [
        m("span#counter-value", String(count)),
        m("button#counter-btn", { onclick: () => (count += 1) }, "Increment"),
      ]),
  }
}

interface Item {
  readonly id: number
  readonly label: string
}

/** Closure component rendering a keyed list (§6.5, list redraws / keyed reordering). */
const ItemList = (): Component => {
  const items: Item[] = [
    { id: 1, label: "First" },
    { id: 2, label: "Second" },
    { id: 3, label: "Third" },
  ]

  return {
    view: () => m("ul.item-list", items.map((item) => m("li", { key: item.id }, item.label))),
  }
}

const App: Component = {
  view: () =>
    m("div#app-root.app", [
      m(Greeting),
      m(
        "p",
        "This playground demonstrates the esbuild adapter (task 0024): hover an element, " +
          "click it, then use Open in editor.",
      ),
      m(Counter),
      m(ItemList),
    ]),
}

const root = document.getElementById("app")
if (root !== null) m.mount(root, App)

if (__DEV__) {
  void import("virtual:mithril-inspector/overlay")
}
