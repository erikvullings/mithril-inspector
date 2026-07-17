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
]

/**
 * Keyed list with shuffle/remove controls (§19.2 "list redraws", "keyed
 * reordering", assertions 7 and 8). Each item's DOM id tracks its key so a
 * test can tell which item currently occupies a given screen position.
 * Written as `const X = () => {...}` (not `function X() {...}`): only that
 * form is lifecycle-wrapped for instance tracking (runtime README "Known
 * Phase 1 limitations" — standalone function *declarations* are registered
 * for display-name resolution only).
 */
export const ListScene = (): Component => {
  let items: Item[] = initialItems.slice()

  const shuffle = (): void => {
    const [first, second, third] = items
    if (first === undefined || second === undefined || third === undefined) return
    items = [second, third, first]
  }

  const remove = (key: string): void => {
    items = items.filter((item) => item.key !== key)
  }

  return {
    view: () =>
      m("div.list-scene", [
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
