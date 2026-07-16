/**
 * Test-only helpers shared by the source-map and executed-fixture suites:
 * esbuild chaining the way Vite would run it, map composition, and 1-based
 * position tracing (§6.7, ADR-102).
 */
import remappingImport from "@ampproject/remapping"
import type { SourceMapInput } from "@ampproject/remapping"
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping"
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

/** 1-based line and column, the public-API convention of §6.3. */
export interface Position {
  line: number
  column: number
}

/** Number of occurrences of `needle` in `text`. */
export const occurrencesOf = (text: string, needle: string): number => {
  let count = 0
  let index = text.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = text.indexOf(needle, index + 1)
  }
  return count
}

/** Position of the nth occurrence of `needle` in `text`. */
export const positionOf = (text: string, needle: string, occurrence = 1): Position => {
  let index = -1
  for (let found = 0; found < occurrence; found += 1) {
    index = text.indexOf(needle, index + 1)
    if (index === -1) throw new Error(`needle not found: ${needle}`)
  }
  const before = text.slice(0, index)
  return { line: before.split("\n").length, column: index - before.lastIndexOf("\n") }
}

/**
 * Finds `needle` in generated code and traces it back through `tracer`,
 * converting trace-mapping's 0-based columns to the 1-based convention.
 */
export const tracedOriginalPosition = (
  tracer: TraceMap,
  generatedCode: string,
  needle: string,
  occurrence = 1,
): Position => {
  const generated = positionOf(generatedCode, needle, occurrence)
  const original = originalPositionFor(tracer, {
    line: generated.line,
    column: generated.column - 1,
  })
  if (original.line == null || original.column == null) {
    throw new Error(`no original mapping for: ${needle}`)
  }
  return { line: original.line, column: original.column + 1 }
}
