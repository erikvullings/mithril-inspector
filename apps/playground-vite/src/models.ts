import type { ComponentTypes } from "mithril"

export enum Pages {
  HOME = "home",
  LIST = "list",
  FRAGMENT = "fragment",
  TRUSTED_HTML = "trusted-html",
  SVG = "svg",
  SHADOW_DOM = "shadow-dom",
  DIALOG = "dialog",
  SCROLL = "scroll",
  TRANSFORM = "transform",
  STATE_DEMO = "state-demo",
}

export interface PageDef {
  readonly id: Pages
  readonly title: string
  readonly route: string
  readonly component: ComponentTypes
}
