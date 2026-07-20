import type { ModuleId } from "@mithril-inspector/protocol"

/**
 * The HMR invalidation event/payload (ADR-106, §11.2) is a shared,
 * bundler-neutral wire-protocol constant — defined once in
 * `@mithril-inspector/adapter-kit` and re-exported here so the rest of this
 * package (and existing consumers of `./hmr.js`) don't need to know it moved.
 */
export { HMR_INVALIDATE_EVENT } from "@mithril-inspector/adapter-kit"
export type { HmrInvalidatePayload } from "@mithril-inspector/adapter-kit"

/**
 * Normalize a bundler id / file path to the transform's canonical form
 * (forward slashes, no query) so the id recorded during `transform` and the id
 * looked up in `handleHotUpdate` address the same entry (ADR-106).
 */
export function normalizeFile(id: string): string {
  return id.replace(/\\/g, "/").split("?", 1)[0] ?? id
}

/**
 * Tracks the stable module id the transform assigned to each instrumented file,
 * so a hot update can tell the runtime which module to invalidate. Keyed by the
 * normalized file path.
 */
export interface ModuleIdRegistry {
  /** Remember the module id an instrumented file was assigned. */
  record(file: string, moduleId: ModuleId): void
  /** Drop a file's entry (e.g. it stopped being instrumented). */
  forget(file: string): void
  /** The module id recorded for a file, or `undefined`. */
  moduleIdFor(file: string): ModuleId | undefined
}

export function createModuleIdRegistry(): ModuleIdRegistry {
  const byFile = new Map<string, ModuleId>()
  return {
    record(file, moduleId) {
      byFile.set(normalizeFile(file), moduleId)
    },
    forget(file) {
      byFile.delete(normalizeFile(file))
    },
    moduleIdFor(file) {
      return byFile.get(normalizeFile(file))
    },
  }
}
