import type { ConfigEnv, HmrContext, Plugin, PluginOption, ResolvedConfig, ViteDevServer } from "vite"

import {
  loadVirtualModule,
  resolveInspectorOptions,
  resolveVirtualId,
  shouldAttemptTransform,
  toOverlayOptionsInput,
  toRuntimeBootstrapConfig,
  toServerOptions,
  toTransformOptions,
  type MithrilInspectorOptions,
  type VirtualModuleDeps,
} from "@mithril-inspector/adapter-kit"
import { createInspectorMiddleware } from "@mithril-inspector/server"
import { transformMithrilModule } from "@mithril-inspector/transform"

import { createDiagnosticsMiddleware } from "./diagnostics.js"
import { overlayBootstrapTags } from "./html.js"
import {
  createModuleIdRegistry,
  HMR_INVALIDATE_EVENT,
  type HmrInvalidatePayload,
} from "./hmr.js"

/**
 * The Vite integration for Mithril Inspector (§4, §11). Zero-config:
 * `plugins: [mithrilInspector()]` (§2.2). Returns a two-plugin array (§11.1):
 *
 * - **`mithril-inspector:pre`** (`enforce: "pre"`, §11.3) — serves the virtual
 *   runtime/overlay modules, instruments source files *before* Vite's esbuild
 *   TS/JSX transform lowers them (the transform reads original TS/JSX at the AST
 *   level, §6.6), and drives HMR invalidation (ADR-106).
 * - **`mithril-inspector:serve`** — injects the overlay bootstrap into the page
 *   (`transformIndexHtml`, no entry-file edits) and registers the open-in-editor
 *   middleware (§10).
 *
 * Both are dev-only: `apply` disables them during `vite build` unless
 * `includeInProduction` is set, so production bundles contain no runtime,
 * overlay or endpoint (§2.1, §20.1.12).
 *
 * @param env injectable environment for the `NODE_ENV` dev-default (§2.1),
 *   defaulting to `process.env`; primarily a test seam.
 */
export function mithrilInspector(
  options: MithrilInspectorOptions = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
): PluginOption[] {
  const resolved = resolveInspectorOptions(options, env)

  // Config that does not depend on the resolved Vite root — precomputed once.
  const virtualDeps: VirtualModuleDeps = {
    runtimeConfig: toRuntimeBootstrapConfig(resolved),
    overlayOptions: toOverlayOptionsInput(resolved),
  }
  const moduleIds = createModuleIdRegistry()

  // Populated in `configResolved`; read by `transform`, `transformIndexHtml`
  // and `configureServer`.
  const state = { root: process.cwd(), base: "/" }

  /** Dev-only gate: active on `serve`, and on `build` only if forced (§2.1). */
  const apply = (_config: unknown, viteEnv: ConfigEnv): boolean =>
    resolved.enabled && (viteEnv.command === "serve" || resolved.includeInProduction)

  const prePlugin: Plugin = {
    name: "mithril-inspector:pre",
    enforce: "pre",
    apply,

    configResolved(config: ResolvedConfig) {
      state.root = config.root
    },

    resolveId(id) {
      return resolveVirtualId(id)
    },

    load(id) {
      return loadVirtualModule(id, virtualDeps)
    },

    transform(code, id) {
      if (!shouldAttemptTransform(id)) return null
      const result = transformMithrilModule({
        id,
        code,
        ...toTransformOptions(resolved, state.root),
      })
      if (result === null) return null
      // Remember this file's stable module id so HMR can invalidate it (ADR-106).
      moduleIds.record(result.metadata.file, result.metadata.id)
      if (result.map === undefined) return { code: result.code }
      // Normalize sourcesContent and file property for Vite's source map requirements
      const sourcesContent = result.map.sourcesContent?.filter((s): s is string => s !== null)
      const map = {
        version: result.map.version,
        file: result.map.file || undefined,
        sources: result.map.sources,
        sourcesContent,
        names: result.map.names,
        mappings: result.map.mappings,
      }
      return { code: result.code, map } as any
    },

    handleHotUpdate(ctx: HmrContext) {
      const moduleId = moduleIds.moduleIdFor(ctx.file)
      if (moduleId === undefined) return
      // Invalidate the stale table up front; the re-executed module's own
      // `__miRegisterModule` restores a fresh one (ADR-106). Selection survival
      // is computed lazily in the overlay, so nothing else crosses the boundary.
      const payload: HmrInvalidatePayload = { moduleIds: [moduleId] }
      ctx.server.ws.send({ type: "custom", event: HMR_INVALIDATE_EVENT, data: payload })
      return undefined
    },
  }

  const servePlugin: Plugin = {
    name: "mithril-inspector:serve",
    apply,

    configResolved(config: ResolvedConfig) {
      state.root = config.root
      state.base = config.base
    },

    transformIndexHtml: {
      order: "pre",
      handler(_html, ctx) {
        return overlayBootstrapTags({ dev: ctx.server !== undefined, base: state.base })
      },
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use(createInspectorMiddleware(toServerOptions(resolved, state.root)))
      if (resolved.debug) {
        server.middlewares.use(
          createDiagnosticsMiddleware({
            mode: resolved.mode,
            exposeDomAttributes: resolved.source.exposeDomAttributes,
          }),
        )
      }
    },
  }

  return [prePlugin, servePlugin]
}
