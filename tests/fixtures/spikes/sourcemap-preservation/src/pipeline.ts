import remappingImport from "@ampproject/remapping"
import type { SourceMapInput } from "@ampproject/remapping"
import { TraceMap } from "@jridgewell/trace-mapping"
import { transform as esbuildTransform } from "esbuild"
import type { Loader } from "esbuild"

// The package ships real ESM (dist/remapping.mjs) whose default export is the
// function, but its CJS-flavored .d.ts makes NodeNext type the default import
// as the module namespace — unwrap the type without touching the runtime value.
const remapping = remappingImport as unknown as typeof remappingImport.default

export interface ChainedStage {
  code: string
  map: string
}

/**
 * Runs one esbuild transform stage the way Vite would (TS erasure, JSX
 * lowering, optional minification), always emitting a source map.
 */
export async function chainThroughEsbuild(
  code: string,
  options: { loader: Loader; minify?: boolean },
): Promise<ChainedStage> {
  const result = await esbuildTransform(code, {
    loader: options.loader,
    format: "esm",
    target: "esnext",
    sourcemap: true,
    minify: options.minify ?? false,
  })
  return { code: result.code, map: result.map }
}

/**
 * Composes a chain of stage maps (most recent first, as remapping expects)
 * into one tracer from final output positions to the original module.
 */
export function composedTracer(maps: ReadonlyArray<string | object>): TraceMap {
  const merged = remapping(maps as SourceMapInput[], () => null)
  return new TraceMap(merged as unknown as ConstructorParameters<typeof TraceMap>[0])
}
