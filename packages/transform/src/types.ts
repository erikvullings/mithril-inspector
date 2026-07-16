import type { ModuleInspectionMetadata } from "@mithril-inspector/protocol"
import type { FilterPattern } from "@rollup/pluginutils"
import type { SourceMap } from "magic-string"

export type { FilterPattern, SourceMap }

/** Source marker kinds (§6.3). */
export type SourceKind =
  | "component-declaration"
  | "component-view"
  | "element"
  | "attribute"
  | "text-expression"
  | "unknown"

/**
 * One source record as the transform registers it with the runtime — the
 * compact subset of the full `SourceLocation` (§6.3, ADR-106). Lines and
 * columns are 1-based; `endColumn` is the 1-based column one past the node.
 */
export interface SourceRecord {
  readonly line: number
  readonly column: number
  readonly endLine: number
  readonly endColumn: number
  readonly kind: SourceKind
  readonly displayName?: string
  readonly tagName?: string
}

/**
 * The payload the injected `__miRegisterModule("m:…", { … })` call hands the
 * runtime for one version of a module (§6.1, ADR-106).
 */
export interface ModuleRegistration {
  readonly file: string
  readonly relativeFile: string
  readonly sources: Readonly<Record<string, SourceRecord>>
}

/** Options for the bundler-neutral transform (§4, §6.4, §11.2). */
export interface TransformOptions {
  /** Resolved module id (usually an absolute file path, may carry a query). */
  id: string
  code: string
  /** Project root; makes `relativeFile` and the module id root-relative. */
  root?: string
  /** Emit a high-resolution source map (default true, §6.7). */
  sourcemap?: boolean
  include?: FilterPattern
  exclude?: FilterPattern
  /**
   * Module specifier for the injected runtime import. Adapters override it —
   * the Vite plugin passes `virtual:mithril-inspector/runtime` (§11.2).
   */
  runtimeModule?: string
  /** Module sources whose imports provide Mithril (§6.4). */
  mithrilImports?: readonly string[]
  /** Named exports of those modules treated as hyperscript factories (§6.4). */
  hyperscriptIdentifiers?: readonly string[]
}

export interface TransformResult {
  code: string
  map?: SourceMap
  metadata: ModuleInspectionMetadata
}
