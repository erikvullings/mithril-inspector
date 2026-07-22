import { fileURLToPath } from "node:url"

import type { Plugin } from "rollup"

import {
  isVirtualModuleDependencyImport,
  loadVirtualModule,
  resolveInspectorOptions,
  resolveVirtualId,
  shouldAttemptTransform,
  toOverlayOptionsInput,
  toRuntimeBootstrapConfig,
  toTransformOptions,
  type MithrilInspectorOptions,
  type VirtualModuleDeps,
} from "@mithril-inspector/adapter-kit"
import { transformMithrilModule } from "@mithril-inspector/transform"

export type { MithrilInspectorOptions }

/**
 * A real file inside this package's own installed directory — see the
 * identical comment in `@mithril-inspector/vite`'s `plugin.ts` for why the
 * virtual modules' bare `@mithril-inspector/runtime`/`overlay` imports need
 * an explicit real-file importer rather than relying on Rollup's default
 * resolution (which falls back to the project root for a non-file importer).
 * Note this still requires the consuming project's Rollup config to include
 * a node-resolution plugin (e.g. `@rollup/plugin-node-resolve`) — Rollup
 * core has no bare-specifier/`node_modules` resolution of its own, with or
 * without this fix.
 */
const PACKAGE_FILE = fileURLToPath(import.meta.url)

/**
 * The Rollup integration for Mithril Inspector (§4, §12.3): a thin adapter
 * over the shared transform (`@mithril-inspector/transform`) and runtime
 * (`@mithril-inspector/runtime`) — same option shape and instrumentation
 * behaviour as `@mithril-inspector/vite` (§5), reused rather than
 * reimplemented via `@mithril-inspector/adapter-kit`.
 *
 * Unlike Vite, Rollup has no development-server hooks of its own, so this
 * plugin only covers AST transformation, virtual runtime/overlay module
 * resolution and source maps (§12.3). Editor launching is not wired up
 * automatically — see the package README for the three supported patterns
 * (dev-server integration, a standalone `startInspectorServer`, or a
 * configured/proxied endpoint URL).
 *
 * Dev-only guard (§2.1 analog): active only while Rollup is running in watch
 * mode (`this.meta.watchMode`, Rollup's equivalent of Vite's `command ===
 * "serve"`) unless `includeInProduction` is set, so a plain one-off
 * `rollup.rollup()`/`rollup build` never emits inspector code (§20.1.12).
 *
 * @param env injectable environment for the `NODE_ENV` dev-default (§2.1),
 *   defaulting to `process.env`; primarily a test seam.
 */
export function mithrilInspector(
  options: MithrilInspectorOptions = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
): Plugin {
  const resolved = resolveInspectorOptions(options, env)
  const root = resolved.root ?? process.cwd()

  const virtualDeps: VirtualModuleDeps = {
    runtimeConfig: toRuntimeBootstrapConfig(resolved),
    overlayOptions: toOverlayOptionsInput(resolved),
  }

  const transformOptions = toTransformOptions(resolved, root)

  function isActive(watchMode: boolean): boolean {
    return resolved.enabled && (watchMode || resolved.includeInProduction)
  }

  return {
    name: "mithril-inspector",

    resolveId(id, importer) {
      if (!isActive(this.meta.watchMode)) return null
      const virtualId = resolveVirtualId(id)
      if (virtualId !== null) return virtualId
      if (isVirtualModuleDependencyImport(id, importer)) {
        return this.resolve(id, PACKAGE_FILE, { skipSelf: true })
      }
      return null
    },

    load(id) {
      if (!isActive(this.meta.watchMode)) return null
      return loadVirtualModule(id, virtualDeps)
    },

    transform: {
      order: "pre",
      handler(code, id) {
        if (!isActive(this.meta.watchMode)) return null
        if (!shouldAttemptTransform(id)) return null
        const result = transformMithrilModule({ id, code, ...transformOptions })
        if (result === null) return null
        if (result.map === undefined) return { code: result.code }
        // Normalize sourcesContent: Rollup expects string[] not (string | null)[]
        const sourcesContent = result.map.sourcesContent?.filter((s): s is string => s !== null)
        const map = {
          version: result.map.version,
          file: result.map.file,
          sources: result.map.sources,
          sourcesContent,
          names: result.map.names,
          mappings: result.map.mappings,
        }
        return { code: result.code, map } as any
      },
    },
  }
}
