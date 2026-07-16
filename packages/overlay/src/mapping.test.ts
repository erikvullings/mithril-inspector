import type { SourceLocation } from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import { describeMapping, formatFileLine } from "./mapping.js"

const loc = (init: Partial<SourceLocation> & { kind: SourceLocation["kind"] }): SourceLocation => ({
  moduleId: "m:abc",
  sourceId: "s1",
  absoluteFile: "/project/src/UserCard.ts",
  relativeFile: "src/UserCard.ts",
  line: 17,
  column: 5,
  ...init,
})

describe("formatFileLine", () => {
  it("formats file:line:column", () => {
    expect(formatFileLine(loc({ kind: "element" }))).toBe("src/UserCard.ts:17:5")
  })

  it("drops the column when it is absent", () => {
    expect(formatFileLine(loc({ kind: "element", column: 0 }))).toBe("src/UserCard.ts:17")
  })

  it("drops line and column when there is no usable line", () => {
    expect(formatFileLine(loc({ kind: "unknown", line: 0, column: 0 }))).toBe("src/UserCard.ts")
  })
})

describe("describeMapping — §2.4 exact vs inferred ladder", () => {
  it("marks an element expression as exact", () => {
    const info = describeMapping(loc({ kind: "element" }))
    expect(info.precision).toBe("exact")
    expect(info.label).toBe("Exact element source")
    expect(info.fileLine).toBe("src/UserCard.ts:17:5")
  })

  it("marks a component view as inferred", () => {
    const info = describeMapping(loc({ kind: "component-view" }))
    expect(info.precision).toBe("inferred")
    expect(info.label).toBe("Component view")
  })

  it("marks a component declaration as inferred", () => {
    expect(describeMapping(loc({ kind: "component-declaration" })).precision).toBe("inferred")
  })

  it("treats a file-only unknown location as the inferred module tier", () => {
    const info = describeMapping(loc({ kind: "unknown", line: 0, column: 0 }))
    expect(info.precision).toBe("inferred")
    expect(info.label).toBe("Module source")
    expect(info.fileLine).toBe("src/UserCard.ts")
  })

  it("degrades an unknown location with no file to none", () => {
    const info = describeMapping(loc({ kind: "unknown", relativeFile: "", absoluteFile: "", line: 0, column: 0 }))
    expect(info.precision).toBe("none")
  })

  it("degrades a null location to none", () => {
    const info = describeMapping(null)
    expect(info.precision).toBe("none")
    expect(info.fileLine).toBeNull()
    expect(info.location).toBeNull()
  })
})
