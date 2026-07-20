/**
 * Coarse pre-filter for the `transform` hook (§11.2): decide whether a module id
 * is even a candidate for instrumentation before handing it to the shared
 * transform. The transform applies its own extension / `.d.ts` / include-exclude
 * checks; this only cheaply rejects virtual modules, `node_modules` dependencies
 * and the inspector's own packages (which import Mithril themselves and must not
 * be instrumented recursively).
 */

const NODE_MODULES = /(?:^|\/)node_modules\//
const SELF_PACKAGE =
  /(?:@mithril-inspector\/|mithril-inspector\/packages\/)(?:overlay|runtime|transform|server|protocol|vite|rollup|adapter-kit)(?:\/|$)/

export function shouldAttemptTransform(id: string): boolean {
  // Vite prefixes resolved virtual/proxy module ids with a NUL byte (§11.2).
  if (id.startsWith("\0")) return false
  const path = (id.replace(/\\/g, "/").split("?", 1)[0] ?? id)
  if (NODE_MODULES.test(path)) return false
  if (SELF_PACKAGE.test(path)) return false
  return true
}
