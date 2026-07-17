import { readFileSync } from "node:fs"

/** 1-based line number of the first line containing `needle` — avoids hardcoding fixture line numbers in tests. */
export function lineOf(file: string, needle: string): number {
  return positionOf(file, needle).line
}

/**
 * 1-based `{ line, column }` of the start of `needle`'s first occurrence,
 * matching the transform's `node.loc.start.column + 1` convention (packages/
 * transform/src/instrument.ts) — avoids hardcoding fixture source positions.
 */
export function positionOf(file: string, needle: string): { line: number; column: number } {
  const lines = readFileSync(file, "utf8").split("\n")
  for (let index = 0; index < lines.length; index += 1) {
    const column = lines[index]?.indexOf(needle) ?? -1
    if (column !== -1) return { line: index + 1, column: column + 1 }
  }
  throw new Error(`"${needle}" not found in ${file}`)
}
