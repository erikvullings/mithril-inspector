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
