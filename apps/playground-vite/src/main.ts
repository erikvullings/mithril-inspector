import m from "mithril"

import "./style.css"
import { routingSvc } from "./services/routing-service.js"
import { StatusWidget } from "./status-widget.js"

const appRoot = document.getElementById("app")
const statusRoot = document.getElementById("status-root")

if (appRoot !== null) {
  m.route(appRoot, routingSvc.defaultRoute, routingSvc.routingTable())
}

/** A second, independent mount root (§19.2 "multiple mount roots"). */
if (statusRoot !== null) {
  m.mount(statusRoot, StatusWidget)
}
