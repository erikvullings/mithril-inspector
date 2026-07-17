export const packageName = "@mithril-inspector/vite" as const

export { mithrilInspector } from "./plugin.js"

export { DEFAULT_REDACT_KEYS } from "./options.js"
export type {
  MithrilInspectorOptions,
  ResolvedComponentTreeOptions,
  ResolvedInspectorOptions,
  ResolvedPickerOptions,
  ResolvedSourceOptions,
  ResolvedUiOptions,
  RuntimeBootstrapConfig,
} from "./options.js"

export { OVERLAY_MODULE_ID, RUNTIME_MODULE_ID } from "./ids.js"

/** Default export so `import mithrilInspector from "@mithril-inspector/vite"` also works. */
export { mithrilInspector as default } from "./plugin.js"
