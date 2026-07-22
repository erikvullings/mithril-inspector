/**
 * Virtual module identifiers served by the plugin (§11.2). Kept dependency-free
 * so both the options layer (which points the transform's injected import at the
 * runtime module) and the resolve/load layer can share them without a cycle.
 */

/** Public specifier the instrumented modules import the runtime helpers from. */
export const RUNTIME_MODULE_ID = "virtual:mithril-inspector/runtime"

/** Public specifier the HTML bootstrap imports to mount the overlay. */
export const OVERLAY_MODULE_ID = "virtual:mithril-inspector/overlay"

/**
 * Internal resolved ids. Vite convention: prefix a virtual module's resolved id
 * with a NUL byte so other plugins leave it untouched (§11.2).
 */
export const RESOLVED_RUNTIME_ID = `\0${RUNTIME_MODULE_ID}`
export const RESOLVED_OVERLAY_ID = `\0${OVERLAY_MODULE_ID}`

/** Bare specifiers the generated virtual-module code (`virtual-modules.ts`) imports. */
export const RUNTIME_PACKAGE_ID = "@mithril-inspector/runtime"
export const OVERLAY_PACKAGE_ID = "@mithril-inspector/overlay"

const VIRTUAL_MODULE_IMPORTERS: ReadonlySet<string> = new Set([RESOLVED_RUNTIME_ID, RESOLVED_OVERLAY_ID])
const VIRTUAL_MODULE_DEPENDENCY_IDS: ReadonlySet<string> = new Set([RUNTIME_PACKAGE_ID, OVERLAY_PACKAGE_ID])

/**
 * True when `id`/`importer` is a bare `@mithril-inspector/runtime` or `/overlay`
 * import requested from inside the generated virtual module code itself (i.e.
 * `importer` is that module's resolved id). Those specifiers aren't necessarily
 * resolvable from the *consuming* project — it may not depend on those packages
 * directly, so under a strict/isolated `node_modules` layout (pnpm's default)
 * the bundler's default resolution, which falls back to the project root when
 * given a non-file importer, fails to find them. Vite/Rollup `resolveId` hooks
 * use this to redirect resolution to a real file inside the adapter's own
 * installed directory instead (mirrors esbuild's `onLoad` `resolveDir`).
 */
export function isVirtualModuleDependencyImport(id: string, importer: string | undefined): boolean {
  return importer !== undefined && VIRTUAL_MODULE_IMPORTERS.has(importer) && VIRTUAL_MODULE_DEPENDENCY_IDS.has(id)
}
