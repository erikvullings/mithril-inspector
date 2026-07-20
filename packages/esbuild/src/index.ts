export const packageName = "@mithril-inspector/esbuild" as const

export { mithrilInspector } from "./plugin.js"
export type { MithrilInspectorEsbuildOptions, MithrilInspectorOptions } from "./plugin.js"

/** Default export so `import mithrilInspector from "@mithril-inspector/esbuild"` also works. */
export { mithrilInspector as default } from "./plugin.js"

export { createEsbuildDevServer } from "./dev-server.js"
export type { EsbuildDevServerHandle, EsbuildDevServerOptions } from "./dev-server.js"
