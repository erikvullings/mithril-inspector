import m, { type RouteDefs } from "mithril"

import { Layout } from "../components/layout.js"
import { Pages, type PageDef } from "../models.js"
import { DialogPage } from "../pages/dialog-page.js"
import { FragmentPage } from "../pages/fragment-page.js"
import { HomePage } from "../pages/home-page.js"
import { ListPage } from "../pages/list-page.js"
import { ScrollPage } from "../pages/scroll-page.js"
import { ShadowDomPage } from "../pages/shadow-dom-page.js"
import { SvgPage } from "../pages/svg-page.js"
import { TransformPage } from "../pages/transform-page.js"
import { TrustedHtmlPage } from "../pages/trusted-html-page.js"

/**
 * Class-based routing service (§6.5 "closure/class/object" mix, structural
 * inspiration from https://github.com/erikvullings/mithril-app's
 * `RoutingService`) building an `m.route` `RouteDefs` table (§19.2 "routing").
 */
class RoutingService {
  readonly pages: readonly PageDef[] = [
    { id: Pages.HOME, title: "Home", route: "/", component: HomePage },
    { id: Pages.LIST, title: "List", route: "/list", component: ListPage },
    { id: Pages.FRAGMENT, title: "Fragment", route: "/fragment", component: FragmentPage },
    { id: Pages.TRUSTED_HTML, title: "Trusted HTML", route: "/trusted-html", component: TrustedHtmlPage },
    { id: Pages.SVG, title: "SVG", route: "/svg", component: SvgPage },
    { id: Pages.SHADOW_DOM, title: "Shadow DOM", route: "/shadow-dom", component: ShadowDomPage },
    { id: Pages.DIALOG, title: "Dialog", route: "/dialog", component: DialogPage },
    { id: Pages.SCROLL, title: "Scroll", route: "/scroll", component: ScrollPage },
    { id: Pages.TRANSFORM, title: "Transform", route: "/transform", component: TransformPage },
  ]

  get defaultRoute(): string {
    return this.pages[0]?.route ?? "/"
  }

  routingTable(): RouteDefs {
    return this.pages.reduce<RouteDefs>((table, page) => {
      table[page.route] = {
        render: () => m(Layout, { pages: this.pages }, m(page.component)),
      }
      return table
    }, {})
  }
}

export const routingSvc = new RoutingService()
