export const packageName = "@mithril-inspector/transform" as const

export { clearTransformCache, transformMithrilModule } from "./transform.js"
export type {
  FilterPattern,
  ModuleRegistration,
  SourceKind,
  SourceMap,
  SourceRecord,
  TransformOptions,
  TransformResult,
} from "./types.js"
