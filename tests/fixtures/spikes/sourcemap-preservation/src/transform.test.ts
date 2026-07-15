import { readFileSync } from "node:fs"

import { TraceMap } from "@jridgewell/trace-mapping"
import { describe, expect, it } from "vitest"

import { positionOf, tracedOriginalPosition } from "./positions.js"
import { transformMithrilModule } from "./transform.js"

const userCardSource = readFileSync(
  new URL("../fixtures/user-card.ts", import.meta.url),
  "utf8",
)

const helloSource = readFileSync(new URL("../fixtures/hello.tsx", import.meta.url), "utf8")

describe("transformMithrilModule", () => {
  it("wraps every m(...) call and reports exact 1-based source markers", () => {
    const result = transformMithrilModule({ id: "user-card.ts", code: userCardSource })
    expect(result).not.toBeNull()
    const { code, markers } = result as NonNullable<typeof result>

    expect(code.startsWith("import { source as __miSource } from")).toBe(true)
    expect(code).toContain('__miSource("s1", m("article.user-card"')
    expect(code).toContain('__miSource("s2", m("h2"')
    expect(code).toContain('__miSource("s3", m("button"')
    expect(code).toContain('__miSource("s4", m("span.spacer"')

    expect(markers).toEqual([
      { sourceId: "s1", ...positionOf(userCardSource, 'm("article.user-card"') },
      { sourceId: "s2", ...positionOf(userCardSource, 'm("h2"') },
      { sourceId: "s3", ...positionOf(userCardSource, 'm("button"') },
      { sourceId: "s4", ...positionOf(userCardSource, 'm("span.spacer"') },
    ])
  })

  it("returns a map that resolves transformed positions to exact original positions", () => {
    const result = transformMithrilModule({ id: "user-card.ts", code: userCardSource })
    const { code, map } = result as NonNullable<typeof result>
    const tracer = new TraceMap(
      JSON.parse(map.toString()) as ConstructorParameters<typeof TraceMap>[0],
    )

    // Two calls share a line in the fixture; each must resolve to its own column.
    for (const needle of ['m("article.user-card"', 'm("h2"', 'm("button"', 'm("span.spacer"']) {
      expect({ needle, ...tracedOriginalPosition(tracer, code, needle) }).toEqual({
        needle,
        ...positionOf(userCardSource, needle),
      })
    }
  })

  it("returns null for modules that do not import mithril", () => {
    const code = 'import x from "other"\nexport const v = x("div")\n'
    expect(transformMithrilModule({ id: "other.ts", code })).toBeNull()
  })

  it("follows an aliased mithril default import", () => {
    const code = 'import Mithril from "mithril"\nexport const v = Mithril("div")\n'
    const result = transformMithrilModule({ id: "alias.ts", code })
    expect(result?.code).toContain('__miSource("s1", Mithril("div"))')
  })

  it("wraps expression-position JSX roots in TSX modules, leaving JSX children alone", () => {
    const result = transformMithrilModule({ id: "hello.tsx", code: helloSource, jsx: true })
    expect(result).not.toBeNull()
    const { code, markers } = result as NonNullable<typeof result>

    expect(code).toContain('__miSource("s1", <section class="hello">')
    expect(code).not.toContain("<h1>Hello, {__miSource")

    expect(markers).toEqual([{ sourceId: "s1", ...positionOf(helloSource, "<section") }])
  })
})
