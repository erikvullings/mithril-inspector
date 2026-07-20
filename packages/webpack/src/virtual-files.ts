import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { overlayModuleCode, runtimeModuleCode, RUNTIME_MODULE_ID } from "@mithril-inspector/adapter-kit"
import type { RuntimeBootstrapConfig } from "@mithril-inspector/adapter-kit"
import type { OverlayOptionsInput } from "@mithril-inspector/overlay"

export interface WrittenBootstrapFiles {
  readonly runtimePath: string
  readonly overlayPath: string
}

/**
 * webpack (and Rspack, which follows webpack's convention here) treats any
 * request matching `<scheme>:...` as a URI and routes it through its own
 * scheme-handling pipeline *before* `resolve.alias` ever runs, throwing
 * `UnhandledSchemeError` for an unrecognized scheme like `virtual:` —
 * confirmed empirically via the real webpack integration fixture, not just
 * documentation (§25.9). Every other adapter's shared virtual specifier
 * (`RUNTIME_MODULE_ID` = `"virtual:mithril-inspector/runtime"`, from
 * adapter-kit) is therefore unusable verbatim here; this colon-free
 * specifier is webpack/Rspack's substitute, used both for the loader's
 * `runtimeModule` transform option (so instrumented app modules import this
 * instead) and for the overlay bootstrap's own hardcoded runtime import,
 * rewritten below.
 */
export const WEBPACK_SAFE_RUNTIME_SPECIFIER = "mithril-inspector/virtual-runtime"
/** The equivalent colon-free substitute for the overlay bootstrap module (manual-import escape hatch only — see README). */
export const WEBPACK_SAFE_OVERLAY_SPECIFIER = "mithril-inspector/virtual-overlay"

/**
 * webpack/Rspack have no first-class virtual-module mechanism the way
 * Vite/Rollup (`resolveId`/`load`) or esbuild (`onResolve`/`onLoad`) do, and
 * Rspack's Rust-side resolver additionally has no hook-based override for
 * arbitrary specifiers (§25.9 — the resolver-hook replacement documented for
 * Rspack, `NormalModuleFactory.hooks.resolve`, only *redirects* an existing
 * request, it cannot serve in-memory content). So instead of an in-memory
 * virtual module, the runtime/overlay bootstrap source is written to real
 * files under the consuming project's own `node_modules/.cache` — a
 * directory both bundlers' standard `node_modules` resolution walks through
 * on the way up from any nested path, so the bootstrap's own bare
 * `@mithril-inspector/runtime`/`overlay` imports resolve without any extra
 * `resolveDir`-style configuration (§11.2 analog). `resolve.alias` (wired by
 * the plugin) then maps the webpack-safe specifiers above onto these paths.
 */
export function writeBootstrapFiles(
  root: string,
  runtimeConfig: RuntimeBootstrapConfig,
  overlayOptions: OverlayOptionsInput,
): WrittenBootstrapFiles {
  const dir = join(root, "node_modules", ".cache", "mithril-inspector")
  mkdirSync(dir, { recursive: true })

  const runtimePath = join(dir, "runtime-bootstrap.js")
  const overlayPath = join(dir, "overlay-bootstrap.js")
  writeFileSync(runtimePath, runtimeModuleCode(runtimeConfig))
  writeFileSync(
    overlayPath,
    overlayModuleCode(overlayOptions).replace(
      JSON.stringify(RUNTIME_MODULE_ID),
      JSON.stringify(WEBPACK_SAFE_RUNTIME_SPECIFIER),
    ),
  )

  return { runtimePath, overlayPath }
}
