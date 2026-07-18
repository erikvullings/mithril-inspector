import m from "mithril"
import type { Component } from "mithril"

export interface UserCardAttrs {
  readonly id: string
  readonly name: string
}

/**
 * Keyed child component (§9.1 "UserCard key=\"42\""), used by `UserList` (task
 * 0022 component-tree browser tests). A plain object component — like
 * `Greeting`/`Layout`/`FragmentScene` — is instantiated fresh per mount via
 * Mithril's own `Object.create(vnode.tag)` (`mithril/render/render.js`), so
 * each keyed `m(UserCard, { key, ... })` usage gets its own tracked instance
 * without needing the closure-factory form `ListScene`/`Counter` use.
 */
export const UserCard: Component<UserCardAttrs> = {
  view: (vnode) => m(`li.user-card#user-${vnode.attrs.id}`, vnode.attrs.name),
}
