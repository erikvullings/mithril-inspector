import { shouldAttemptTransform } from "@mithril-inspector/adapter-kit"
import { transformMithrilModule } from "@mithril-inspector/transform"
import type { TransformOptions } from "@mithril-inspector/transform"

export type MithrilInspectorLoaderOptions = Omit<TransformOptions, "id" | "code">

/** The slice of webpack/Rspack's `LoaderContext` this loader actually reads. */
export interface LoaderThis {
  readonly resourcePath: string
  getOptions(): MithrilInspectorLoaderOptions
}

export type LoaderCallback = (error: Error | null, content?: string, sourceMap?: unknown) => void

/**
 * Pure loader logic (§12.5 AC: "loader calls the shared `transformMithrilModule`;
 * source maps chained correctly with ts-loader/babel-loader configurations").
 * Kept synchronous and framework-agnostic (no `this.async()`/webpack import)
 * so it is directly unit-testable; `loader.cts` is the thin CJS entry point
 * webpack/Rspack actually load (loaders must be synchronously `require`-able,
 * which this ESM package's compiled output is not — see that file).
 *
 * Source-map chaining: this loader is registered `enforce: "pre"` by the
 * plugin, so it always runs first, directly on the original TS/JSX source —
 * the same source `transformMithrilModule` already knows how to parse. Its
 * output map is then handed to whichever loader runs next (ts-loader,
 * babel-loader, ...) as their `inputSourceMap`, which is how webpack chains
 * loader source maps.
 */
export function runMithrilInspectorLoader(
  context: LoaderThis,
  source: string,
  inputSourceMap: unknown,
  callback: LoaderCallback,
): void {
  if (!shouldAttemptTransform(context.resourcePath)) {
    callback(null, source, inputSourceMap)
    return
  }

  const options = context.getOptions()
  try {
    const result = transformMithrilModule({ id: context.resourcePath, code: source, ...options })
    if (result === null) {
      callback(null, source, inputSourceMap)
      return
    }
    // Normalize sourcesContent: webpack expects string[] not (string | null)[]
    let map = result.map ?? inputSourceMap
    if (map && typeof map === "object" && "sourcesContent" in map && Array.isArray(map.sourcesContent)) {
      map = { ...map, sourcesContent: map.sourcesContent.filter((s): s is string => s !== null) }
    }
    callback(null, result.code, map)
  } catch (error) {
    callback(error instanceof Error ? error : new Error(String(error)))
  }
}
