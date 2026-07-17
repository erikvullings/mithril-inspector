import m from "mithril"
import type { Component } from "mithril"

import { Counter } from "./Counter.js"
import { FragmentScene } from "./FragmentScene.js"
import { Greeting } from "./Greeting.js"
import { HmrScene } from "./Hmr.js"
import { ListScene } from "./ListScene.js"

const counter = Counter()
const listScene = ListScene()

/** Wraps every scene into the primary mount root (§19.2 "nested components"). */
export const Layout: Component = {
  view: () => m("main#layout", [m(Greeting), m(counter), m(listScene), m(FragmentScene), m(HmrScene)]),
}
