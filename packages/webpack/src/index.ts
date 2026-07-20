export const packageName = "@mithril-inspector/webpack" as const

export { mithrilInspector } from "./plugin.js"
export type { MithrilInspectorOptions, MithrilInspectorWebpackPlugin } from "./plugin.js"

/** Default export so `import mithrilInspector from "@mithril-inspector/webpack"` also works. */
export { mithrilInspector as default } from "./plugin.js"

export { wireDevServerMiddleware } from "./dev-server.js"
export type { DevServerLikeConfig, DevServerMiddleware } from "./dev-server.js"
