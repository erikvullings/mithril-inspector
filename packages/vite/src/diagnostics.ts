import type { Connect } from "vite"

import type { InspectorMode } from "@mithril-inspector/runtime"

/** Path of the optional development diagnostics endpoint (§11.2, §16). */
export const DIAGNOSTICS_PATH = "/__mithril-inspector/diagnostics"

export interface DiagnosticsInfo {
  readonly mode: InspectorMode
  readonly exposeDomAttributes: boolean
}

/**
 * A tiny read-only diagnostics endpoint, registered only in `debug` mode
 * (§16). It reports the plugin's active configuration and never returns any
 * component/application data (§15).
 */
export function createDiagnosticsMiddleware(info: DiagnosticsInfo): Connect.NextHandleFunction {
  return (req, res, next) => {
    const pathname = (req.url ?? "").split("?", 1)[0]
    if (pathname !== DIAGNOSTICS_PATH) {
      next()
      return
    }
    res.setHeader("content-type", "application/json")
    res.end(
      JSON.stringify({
        ok: true,
        plugin: "@mithril-inspector/vite",
        mode: info.mode,
        exposeDomAttributes: info.exposeDomAttributes,
      }),
    )
  }
}
