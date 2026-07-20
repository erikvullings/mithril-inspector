export const packageName = "@mithril-inspector/rollup" as const

export { mithrilInspector } from "./plugin.js"
export type { MithrilInspectorOptions } from "./plugin.js"

/** Default export so `import mithrilInspector from "@mithril-inspector/rollup"` also works. */
export { mithrilInspector as default } from "./plugin.js"
