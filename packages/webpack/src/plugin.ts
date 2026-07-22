import { fileURLToPath } from "node:url"

import type { Compiler, Configuration, RuleSetRule } from "webpack"

import {
  OVERLAY_PACKAGE_ID,
  resolveInspectorOptions,
  RUNTIME_PACKAGE_ID,
  toOverlayOptionsInput,
  toRuntimeBootstrapConfig,
  toServerOptions,
  toTransformOptions,
  type MithrilInspectorOptions,
} from "@mithril-inspector/adapter-kit"

import { wireDevServerMiddleware } from "./dev-server.js"
import type { DevServerLikeConfig } from "./dev-server.js"
import { resolveEntryNames } from "./entry.js"
import { WEBPACK_SAFE_OVERLAY_SPECIFIER, WEBPACK_SAFE_RUNTIME_SPECIFIER, writeBootstrapFiles } from "./virtual-files.js"

export type { MithrilInspectorOptions }

const TRANSFORM_TEST = /\.[cm]?[jt]sx?$/
const NODE_MODULES_TEST = /node_modules/

/** The CJS loader entry point (`loader.cts` → `dist/loader.cjs`); see that file for why it must be CJS. */
const LOADER_PATH = fileURLToPath(new URL("./loader.cjs", import.meta.url))

type EntryPluginCtor = new (
  context: string,
  entry: string,
  options?: string | { name?: string },
) => { apply(compiler: Compiler): void }

/**
 * Both webpack (`compiler.webpack`) and Rspack (`compiler.rspack`) expose a
 * back-reference to their own module namespace on the compiler instance
 * specifically so plugin authors can reach classes like `EntryPlugin`
 * without taking a hard runtime dependency on either package (§25.9: this is
 * also required, not just preferred — Rspack's docs explicitly forbid
 * mutating `compiler.options.entry` directly once the compiler is
 * constructed, unlike webpack, so `EntryPlugin` is the only supported way to
 * add an entry on both bundlers).
 */
function resolveEntryPluginCtor(compiler: Compiler): EntryPluginCtor {
  const backref = compiler as unknown as { webpack?: { EntryPlugin: EntryPluginCtor }; rspack?: { EntryPlugin: EntryPluginCtor } }
  const ctor = backref.webpack?.EntryPlugin ?? backref.rspack?.EntryPlugin
  if (ctor === undefined) {
    throw new Error(
      "@mithril-inspector/webpack: could not find EntryPlugin via compiler.webpack or compiler.rspack " +
        "— this compiler is neither a supported webpack nor Rspack version.",
    )
  }
  return ctor
}

export interface MithrilInspectorWebpackPlugin {
  apply(compiler: Compiler): void
}

/**
 * The webpack/Rspack integration for Mithril Inspector (§4, §12.5): a loader
 * for module transformation, a plugin for virtual/runtime entry injection,
 * and dev-server middleware for editor launching — over the same shared
 * transform/runtime/server packages every other adapter reuses (§12.1,
 * ADR-004).
 *
 * Divergences from the Vite/Rollup/esbuild adapters, all forced by webpack's
 * and Rspack's own architecture rather than by choice (§25.9):
 *
 * - No in-memory virtual-module hook exists on either bundler (Rspack's
 *   Rust-side resolver only supports *redirecting* an existing request, not
 *   serving new in-memory content), so the runtime/overlay bootstrap modules
 *   are written to real files under the project's own
 *   `node_modules/.cache/mithril-inspector` (`virtual-files.ts`) and wired
 *   in via `resolve.alias` instead — which also aliases the bootstrap
 *   files' own `@mithril-inspector/runtime`/`overlay` imports straight to
 *   their real resolved paths, since those aren't guaranteed to be
 *   reachable via plain `node_modules` resolution from the bootstrap
 *   files' location (see `writeBootstrapFiles`).
 * - Entries are injected with `EntryPlugin` rather than by editing
 *   `compiler.options.entry` — Rspack explicitly forbids mutating `entry`
 *   after the compiler is constructed; `EntryPlugin` is the common,
 *   supported mechanism on both bundlers.
 * - HMR here is best-effort only: the shared bootstrap's invalidation
 *   channel is wired through Vite's `import.meta.hot`, which webpack/Rspack
 *   never populate (`module.hot` is their own, differently-shaped API) — it
 *   safely evaluates to inactive rather than erroring, but stale-module
 *   invalidation on module replacement does not happen automatically.
 *
 * Dev-only guard (§2.1 analog): active only when `enabled` (default:
 * `NODE_ENV !== "production"`, unchanged from every other adapter) **and**
 * `compiler.options.mode !== "production"`, unless `includeInProduction` is
 * set — mirroring esbuild's `minify`-as-production-signal, since webpack and
 * Rspack both expose `mode` directly (§12.5 AC: "production output contains
 * no inspector code").
 *
 * @param env injectable environment for the `NODE_ENV` dev-default (§2.1),
 *   defaulting to `process.env`; primarily a test seam.
 */
export function mithrilInspector(
  options: MithrilInspectorOptions = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
): MithrilInspectorWebpackPlugin {
  const resolved = resolveInspectorOptions(options, env)

  return {
    apply(compiler: Compiler): void {
      const isProductionMode = compiler.options.mode === "production"
      const isActive = resolved.enabled && (!isProductionMode || resolved.includeInProduction)
      if (!isActive) return

      const root = resolved.root ?? compiler.context

      const { runtimePath, overlayPath, runtimePackageEntry, overlayPackageEntry } = writeBootstrapFiles(
        root,
        toRuntimeBootstrapConfig(resolved),
        toOverlayOptionsInput(resolved),
      )

      // §25.9: webpack/Rspack treat "virtual:..." as a URI scheme and reject
      // it before resolve.alias ever runs (UnhandledSchemeError) — the
      // colon-free WEBPACK_SAFE_RUNTIME_SPECIFIER replaces adapter-kit's
      // RUNTIME_MODULE_ID for this adapter only (see virtual-files.ts).
      const transformOptions = { ...toTransformOptions(resolved, root), runtimeModule: WEBPACK_SAFE_RUNTIME_SPECIFIER }
      const loaderRule: RuleSetRule = {
        enforce: "pre",
        test: TRANSFORM_TEST,
        exclude: NODE_MODULES_TEST,
        use: [{ loader: LOADER_PATH, options: transformOptions }],
      }
      compiler.options.module.rules.unshift(loaderRule)

      compiler.options.resolve.alias = {
        ...compiler.options.resolve.alias,
        [`${WEBPACK_SAFE_RUNTIME_SPECIFIER}$`]: runtimePath,
        [`${WEBPACK_SAFE_OVERLAY_SPECIFIER}$`]: overlayPath,
        // The bootstrap files above bare-import these two packages; alias
        // them straight to their real resolved paths so that import works
        // regardless of whether the consuming project's node_modules
        // happens to hoist them (see the comment on writeBootstrapFiles).
        [`${RUNTIME_PACKAGE_ID}$`]: runtimePackageEntry,
        [`${OVERLAY_PACKAGE_ID}$`]: overlayPackageEntry,
      }

      const { names, dynamic } = resolveEntryNames(compiler.options.entry)
      if (dynamic) {
        console.warn(
          `[mithril-inspector] entry is a function (dynamic entry) — the overlay bootstrap was not ` +
            `auto-injected; import ${JSON.stringify(WEBPACK_SAFE_OVERLAY_SPECIFIER)} manually in your application entry.`,
        )
      } else {
        const EntryPluginCtor = resolveEntryPluginCtor(compiler)
        for (const name of names) {
          new EntryPluginCtor(compiler.context, overlayPath, name).apply(compiler)
        }
      }

      const configuration = compiler.options as Configuration & { devServer?: DevServerLikeConfig }
      configuration.devServer = wireDevServerMiddleware(configuration.devServer, toServerOptions(resolved, root))
    },
  }
}
