import type { HtmlTagDescriptor } from "vite"

import { OVERLAY_MODULE_ID, RESOLVED_OVERLAY_ID } from "@mithril-inspector/adapter-kit"

/**
 * Vite's dev URL for a resolved (NUL-prefixed) virtual module: `/@id/` + the id
 * with the leading NUL encoded as `__x00__`. Unlike a bare `import "virtual:…"`
 * inside an injected inline script — which Vite does *not* rewrite in dev — this
 * URL is served directly by the dev server.
 */
export function devVirtualUrl(resolvedId: string, base = "/"): string {
  const encoded = resolvedId.replace("\0", "__x00__")
  return `${base.replace(/\/+$/, "")}/@id/${encoded}`
}

export interface OverlayBootstrapContext {
  /** Dev server (true) vs. production build (false). */
  readonly dev: boolean
  /** Vite `base`, used to prefix the dev URL. */
  readonly base?: string
}

/**
 * The tags `transformIndexHtml` injects to bootstrap the overlay (§11.2), with
 * no application entry-file edits (§2.2). Prepended to `<head>` so the runtime
 * hook installs as early as possible.
 *
 * - **dev**: a `<script type="module" src="/@id/…">` pointing at the overlay
 *   virtual module's dev URL.
 * - **build** (only reached with `includeInProduction`): an inline
 *   `<script type="module">import "virtual:…"</script>` so Rollup bundles it.
 */
export function overlayBootstrapTags(ctx: OverlayBootstrapContext): HtmlTagDescriptor[] {
  if (ctx.dev) {
    return [
      {
        tag: "script",
        attrs: { type: "module", src: devVirtualUrl(RESOLVED_OVERLAY_ID, ctx.base) },
        injectTo: "head-prepend",
      },
    ]
  }
  return [
    {
      tag: "script",
      attrs: { type: "module" },
      children: `import ${JSON.stringify(OVERLAY_MODULE_ID)};`,
      injectTo: "head-prepend",
    },
  ]
}
