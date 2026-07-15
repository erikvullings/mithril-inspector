import { originalPositionFor } from "@jridgewell/trace-mapping"
import type { TraceMap } from "@jridgewell/trace-mapping"

/** 1-based line and column, the public-API convention of §6.3. */
export interface Position {
  line: number
  column: number
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
