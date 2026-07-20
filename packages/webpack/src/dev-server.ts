import { createInspectorMiddleware } from "@mithril-inspector/server"
import type { InspectorServerOptions } from "@mithril-inspector/server"

/** A connect/Express-style middleware, the shape both webpack-dev-server and Rspack's dev server accept. */
export type DevServerMiddleware = (req: unknown, res: unknown, next: (error?: unknown) => void) => void

/**
 * Deliberately untyped against `webpack-dev-server`'s own `Configuration`
 * (that would force a hard dependency this package doesn't otherwise need,
 * and Rspack's dev-server config — while documented as compatible — ships
 * its own separate types). Both bundlers read `compiler.options.devServer`
 * back out at server-start time and accept `setupMiddlewares(middlewares,
 * devServerContext) => middlewares` with plain-function entries (verified
 * against Rspack's docs, §25.9), so this local shape is the common ground.
 */
export interface DevServerLikeConfig {
  setupMiddlewares?: (middlewares: unknown[], devServerContext: unknown) => unknown[]
  [key: string]: unknown
}

/**
 * Wire the open-in-editor middleware (0011) into a `devServer.setupMiddlewares`
 * config (§12.5 AC: "webpack-dev-server / Rspack dev-server middleware wires
 * `createInspectorMiddleware`"), composing with — never replacing — any
 * `setupMiddlewares` the user already configured.
 */
export function wireDevServerMiddleware(
  devServer: DevServerLikeConfig | undefined,
  serverOptions: InspectorServerOptions,
): DevServerLikeConfig {
  const existingSetup = devServer?.setupMiddlewares
  const editorMiddleware = createInspectorMiddleware(serverOptions) as unknown as DevServerMiddleware

  return {
    ...devServer,
    setupMiddlewares(middlewares, devServerContext) {
      const next = existingSetup ? existingSetup(middlewares, devServerContext) : middlewares
      next.unshift(editorMiddleware)
      return next
    },
  }
}
