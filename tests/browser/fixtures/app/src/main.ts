import m from "mithril"

import { Layout } from "./Layout.js"
import { SecondRoot } from "./SecondRoot.js"

const primaryRoot = document.getElementById("app")
const secondaryRoot = document.getElementById("app2")

if (primaryRoot !== null) m.mount(primaryRoot, Layout)
if (secondaryRoot !== null) m.mount(secondaryRoot, SecondRoot)
