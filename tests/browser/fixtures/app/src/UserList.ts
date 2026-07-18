import m from "mithril"
import type { Component } from "mithril"

import { UserCard } from "./UserCard.js"

interface User {
  readonly id: string
  readonly name: string
}

const initialUsers: readonly User[] = [
  { id: "42", name: "Ada" },
  { id: "84", name: "Grace" },
]

/**
 * A keyed list of `UserCard` components (§9.1's own example tree, task 0022
 * component-tree browser tests). Written as `const X = () => {...}` (not
 * `function X() {...}`) for the same reason as `ListScene`/`Counter` — only
 * that closure form is transform-wrapped for instance tracking.
 */
export const UserList = (): Component => {
  let users: User[] = initialUsers.slice()

  const reorder = (): void => {
    users = users.slice().reverse()
  }

  return {
    view: () =>
      m("div.user-list-scene", [
        m("button#reorder-users-btn", { onclick: reorder }, "Reorder"),
        m(
          "ul#user-list",
          users.map((user) => m(UserCard, { key: user.id, id: user.id, name: user.name })),
        ),
      ]),
  }
}
