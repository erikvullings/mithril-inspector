import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  chainThroughEsbuild,
  composedTracer,
  occurrencesOf,
  positionOf,
  tracedOriginalPosition,
} from "./testkit.js"
import { transformMithrilModule } from "./transform.js"

const userCardSource = readFileSync(new URL("../fixtures/user-card.ts", import.meta.url), "utf8")
const helloSource = readFileSync(new URL("../fixtures/hello.tsx", import.meta.url), "utf8")

const callNeedles = ['m("article.user-card"', 'm("h2"', 'm("button"', 'm("span.spacer"']

describe("source maps survive chained transforms (§6.7)", () => {
  it("maps esbuild TS output back to exact positions in the original .ts file", async () => {
    const result = transformMithrilModule({ id: "/p/user-card.ts", code: userCardSource })
    expect(result).not.toBeNull()
    const { code, map, metadata } = result!

    const compiled = await chainThroughEsbuild(code, { loader: "ts" })
    const tracer = composedTracer([compiled.map, map as object])

    // Same-line sibling calls (button/span.spacer) must resolve to distinct columns.
    for (const needle of callNeedles) {
      expect({ needle, ...tracedOriginalPosition(tracer, compiled.code, needle) }).toEqual({
        needle,
        ...positionOf(userCardSource, needle),
      })
    }

    // The emitted markers agree with the same original positions (§6.3).
    const article = Object.values(metadata.sources).find((s) => s.tagName === "article")!
    expect({ line: article.line, column: article.column }).toEqual(
      positionOf(userCardSource, 'm("article.user-card"'),
    )
  })

  it("maps esbuild TSX output (/** @jsx m */ pragma) back to the original .tsx", async () => {
    const result = transformMithrilModule({ id: "/p/hello.tsx", code: helloSource })
    expect(result).not.toBeNull()
    const { code, map } = result!

    const compiled = await chainThroughEsbuild(code, { loader: "tsx" })

    // The pragma must still be honored with the inspector import prepended.
    expect(compiled.code).toContain('m("section"')
    expect(compiled.code).toContain('m("h1"')

    const tracer = composedTracer([compiled.map, map as object])
    expect(tracedOriginalPosition(tracer, compiled.code, 'm("section"')).toEqual(
      positionOf(helloSource, "<section"),
    )
    expect(tracedOriginalPosition(tracer, compiled.code, 'm("h1"')).toEqual(
      positionOf(helloSource, "<h1"),
    )
  })

  it("survives a third map-producing stage (esbuild minify) with exact positions", async () => {
    const result = transformMithrilModule({ id: "/p/user-card.ts", code: userCardSource })
    expect(result).not.toBeNull()
    const { code, map } = result!

    const compiled = await chainThroughEsbuild(code, { loader: "ts" })
    const minified = await chainThroughEsbuild(compiled.code, { loader: "js", minify: true })
    const tracer = composedTracer([minified.map, compiled.map, map as object])

    // Minified output collapses to one line and renames identifiers, so trace
    // the selector literals: four literals on one generated line must resolve
    // to four distinct original positions. The registration payload prepended
    // by the transform repeats some literals as tag names, so trace the last
    // occurrence — the real call site.
    for (const literal of ['"article.user-card"', '"h2"', '"button"', '"span.spacer"']) {
      const occurrence = occurrencesOf(minified.code, literal)
      expect({ literal, ...tracedOriginalPosition(tracer, minified.code, literal, occurrence) }).toEqual({
        literal,
        ...positionOf(userCardSource, literal),
      })
    }
  })
})
