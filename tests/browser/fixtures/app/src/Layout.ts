import m from "mithril"
import type { Component } from "mithril"

import { Counter } from "./Counter.js"
import { FragmentScene } from "./FragmentScene.js"
import { Greeting } from "./Greeting.js"
import { HmrScene } from "./Hmr.js"
import { ListScene } from "./ListScene.js"
import { UserList } from "./UserList.js"

const listScene = ListScene()
const userList = UserList()

/**
 * Wraps every scene into the primary mount root (§19.2 "nested components").
 * `Counter` is mounted via `m(Counter)` (the factory tag itself), not a
 * pre-instantiated `Counter()` object like `listScene`/`userList` below —
 * that pre-instantiation pattern has Mithril `Object.create` the *already*
 * lifecycle-composed instance a second time (object-component semantics
 * layered on top of closure-component semantics), which buries any state
 * the closure exposes on its returned object one prototype level past where
 * the inspector's state preview looks. Letting Mithril call the factory
 * itself keeps the usual single composed-hooks wrapper, so `Counter`'s
 * `count` (see Counter.ts) stays visible to the State History tab (task
 * 0027).
 */
export const Layout: Component = {
  view: () =>
    m("main#layout", [m(Greeting), m(Counter), m(listScene), m(FragmentScene), m(HmrScene), m(userList)]),
}
