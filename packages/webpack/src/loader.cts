import type { LoaderContext } from "webpack"

import type { MithrilInspectorLoaderOptions } from "./loader.js"

/**
 * webpack/Rspack loaders must be synchronously `require`-able (loader-runner
 * has no async-import fallback), but this package is ESM-only like every
 * other package in this repo. `.cts` is TypeScript's escape hatch for one
 * file to compile to CommonJS regardless of the package's own `"type":
 * "module"` — this is the *only* CJS file in the package, and it is nothing
 * but a thin bridge: it obtains webpack's async callback synchronously (as
 * loaders must), then reaches the real ESM implementation (`loader.ts`,
 * unit-tested directly) via a dynamic `import()`, which is valid and
 * unrestricted from CJS.
 */
module.exports = function mithrilInspectorLoader(
  this: LoaderContext<MithrilInspectorLoaderOptions>,
  source: string,
  inputSourceMap?: unknown,
): void {
  const callback = this.async()
  const context = this
  import("./loader.js")
    .then(({ runMithrilInspectorLoader }) => {
      runMithrilInspectorLoader(context, source, inputSourceMap, callback as never)
    })
    .catch((error: unknown) => {
      callback(error instanceof Error ? error : new Error(String(error)))
    })
}
