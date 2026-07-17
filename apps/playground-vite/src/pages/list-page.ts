import m from "mithril"
import type { Component } from "mithril"

interface Item {
  readonly key: string
  readonly label: string
}

const initialItems: readonly Item[] = [
  { key: "apple", label: "Apple" },
  { key: "banana", label: "Banana" },
  { key: "cherry", label: "Cherry" },
  { key: "date", label: "Date" },
]

/**
 * Closure component (§6.5) demonstrating list redraws, keyed reordering and
 * component removal (§19.2) via a keyed `<li>` list. Written as
 * `const X = () => {...}`, not `function X() {...}` — only that form is
 * fully lifecycle-wrapped for instance tracking in Phase 1 (see
 * packages/runtime/README.md "Known Phase 1 limitations").
 */
export const ListPage = (): Component => {
  let items: Item[] = initialItems.slice()

  const shuffle = (): void => {
    const [first, ...rest] = items
    if (first === undefined) return
    items = [...rest, first]
  }

  const remove = (key: string): void => {
    items = items.filter((item) => item.key !== key)
  }

  return {
    view: () =>
      m("div#list-page.page", [
        m("h2", "List redraws & keyed reordering"),
        m("button#shuffle-btn", { onclick: shuffle }, "Shuffle"),
        m(
          "ul#item-list",
          items.map((item) =>
            m("li.list-item", { id: `item-${item.key}`, key: item.key }, [
              item.label,
              m(
                "button.remove-btn",
                { id: `remove-${item.key}`, onclick: () => remove(item.key) },
                "Remove",
              ),
            ]),
          ),
        ),
      ]),
  }
}
