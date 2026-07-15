import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { chainThroughEsbuild, composedTracer } from "./pipeline.js"
import { positionOf, tracedOriginalPosition } from "./positions.js"
import { transformMithrilModule } from "./transform.js"

const userCardSource = readFileSync(
  new URL("../fixtures/user-card.ts", import.meta.url),
  "utf8",
)

const helloSource = readFileSync(new URL("../fixtures/hello.tsx", import.meta.url), "utf8")

const callNeedles = ['m("article.user-card"', 'm("h2"', 'm("button"', 'm("span.spacer"']

describe("source-map preservation through chained transforms", () => {
  it("maps esbuild TS output back to exact positions in the original .ts fixture", async () => {
    const inspected = transformMithrilModule({ id: "user-card.ts", code: userCardSource })
    expect(inspected).not.toBeNull()
    const { code, map } = inspected as NonNullable<typeof inspected>

    const compiled = await chainThroughEsbuild(code, { loader: "ts" })
    const tracer = composedTracer([compiled.map, map])

    // Same-line sibling calls (button/span.spacer) must resolve to distinct columns.
    for (const needle of callNeedles) {
      expect({ needle, ...tracedOriginalPosition(tracer, compiled.code, needle) }).toEqual({
        needle,
        ...positionOf(userCardSource, needle),
      })
    }
  })

  it("maps esbuild TSX output (/** @jsx m */ pragma) back to the original .tsx", async () => {
    const inspected = transformMithrilModule({ id: "hello.tsx", code: helloSource, jsx: true })
    expect(inspected).not.toBeNull()
    const { code, map } = inspected as NonNullable<typeof inspected>

    const compiled = await chainThroughEsbuild(code, { loader: "tsx" })

    // The pragma must still be honored with the inspector import prepended.
    expect(compiled.code).toContain('m("section"')
    expect(compiled.code).toContain('m("h1"')

    const tracer = composedTracer([compiled.map, map])
    expect(tracedOriginalPosition(tracer, compiled.code, 'm("section"')).toEqual(
      positionOf(helloSource, "<section"),
    )
    expect(tracedOriginalPosition(tracer, compiled.code, 'm("h1"')).toEqual(
      positionOf(helloSource, "<h1"),
    )
  })

  it("survives a third map-producing stage (esbuild minify) with exact positions", async () => {
    const inspected = transformMithrilModule({ id: "user-card.ts", code: userCardSource })
    expect(inspected).not.toBeNull()
    const { code, map } = inspected as NonNullable<typeof inspected>

    const compiled = await chainThroughEsbuild(code, { loader: "ts" })
    const minified = await chainThroughEsbuild(compiled.code, { loader: "js", minify: true })
    const tracer = composedTracer([minified.map, compiled.map, map])

    // Minified output collapses to one line and renames identifiers, so trace
    // the selector literals: four literals on one generated line must resolve
    // to four distinct original positions.
    for (const literal of ['"article.user-card"', '"h2"', '"button"', '"span.spacer"']) {
      expect({ literal, ...tracedOriginalPosition(tracer, minified.code, literal) }).toEqual({
        literal,
        ...positionOf(userCardSource, literal),
      })
    }
  })
})
