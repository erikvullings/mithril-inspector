import type { PreviewNode } from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import { isExpandable, pathKey, summarizeNode } from "./preview.js"

describe("summarizeNode (§7.4 preview tree, task 0022)", () => {
  it("formats every primitive type", () => {
    expect(summarizeNode({ kind: "primitive", type: "string", value: "hi" })).toBe('"hi"')
    expect(summarizeNode({ kind: "primitive", type: "number", value: 42 })).toBe("42")
    expect(summarizeNode({ kind: "primitive", type: "boolean", value: true })).toBe("true")
    expect(summarizeNode({ kind: "primitive", type: "null", value: null })).toBe("null")
    expect(summarizeNode({ kind: "primitive", type: "undefined", value: null })).toBe("undefined")
  })

  it("formats a bigint with a trailing n", () => {
    expect(summarizeNode({ kind: "bigint", value: "9007199254740993" })).toBe("9007199254740993n")
  })

  it("formats a symbol with and without a description", () => {
    expect(summarizeNode({ kind: "symbol", description: "id" })).toBe("Symbol(id)")
    expect(summarizeNode({ kind: "symbol", description: null })).toBe("Symbol()")
  })

  it("formats a function with and without a name", () => {
    expect(summarizeNode({ kind: "function", name: "onClick" })).toBe("ƒ onClick()")
    expect(summarizeNode({ kind: "function", name: "" })).toBe("ƒ ()")
  })

  it("formats a DOM node by tag, falling back to a text/generic marker", () => {
    expect(summarizeNode({ kind: "dom-node", nodeType: 1, tagName: "div" })).toBe("<div>")
    expect(summarizeNode({ kind: "dom-node", nodeType: 3, tagName: null })).toBe("#text")
    expect(summarizeNode({ kind: "dom-node", nodeType: 8, tagName: null })).toBe("#node")
  })

  it("formats an error as name: message", () => {
    expect(summarizeNode({ kind: "error", name: "TypeError", message: "boom" })).toBe("TypeError: boom")
  })

  it("formats a promise, containers, redacted, circular, getter and max-depth placeholders", () => {
    expect(summarizeNode({ kind: "promise" })).toBe("Promise")
    expect(summarizeNode({ kind: "array", length: 3, items: [], offset: 0, truncated: false, path: [] })).toBe(
      "Array(3)",
    )
    expect(
      summarizeNode({ kind: "object", className: "User", size: 2, entries: [], offset: 0, truncated: false, path: [] }),
    ).toBe("User")
    expect(summarizeNode({ kind: "map", size: 1, entries: [], offset: 0, truncated: false, path: [] })).toBe("Map(1)")
    expect(summarizeNode({ kind: "set", size: 4, items: [], offset: 0, truncated: false, path: [] })).toBe("Set(4)")
    expect(
      summarizeNode({ kind: "typed-array", typeName: "Uint8Array", length: 8, items: [], offset: 0, truncated: false, path: [] }),
    ).toBe("Uint8Array(8)")
    expect(summarizeNode({ kind: "getter", path: [] })).toBe("(...)")
    expect(summarizeNode({ kind: "circular", path: [] })).toBe("[Circular]")
    expect(summarizeNode({ kind: "redacted", replacement: "[redacted]" })).toBe("[redacted]")
    expect(summarizeNode({ kind: "max-depth", path: [] })).toBe("…")
  })
})

describe("isExpandable (§7.4 lazy preview)", () => {
  it("is true for a getter and a max-depth stub", () => {
    expect(isExpandable({ kind: "getter", path: [] })).toBe(true)
    expect(isExpandable({ kind: "max-depth", path: [] })).toBe(true)
  })

  it("is true for a truncated container, false for a fully-shown one", () => {
    const truncated: PreviewNode = { kind: "array", length: 100, items: [], offset: 0, truncated: true, path: [] }
    const full: PreviewNode = { kind: "array", length: 2, items: [], offset: 0, truncated: false, path: [] }
    expect(isExpandable(truncated)).toBe(true)
    expect(isExpandable(full)).toBe(false)
  })

  it("is false for a primitive and a redacted value", () => {
    expect(isExpandable({ kind: "primitive", type: "number", value: 1 })).toBe(false)
    expect(isExpandable({ kind: "redacted", replacement: "[redacted]" })).toBe(false)
  })
})

describe("pathKey", () => {
  it("is stable and unique per path shape", () => {
    expect(pathKey([])).toBe("")
    expect(pathKey([{ kind: "prop", key: "a" }])).toBe(pathKey([{ kind: "prop", key: "a" }]))
    expect(pathKey([{ kind: "prop", key: "a" }])).not.toBe(pathKey([{ kind: "prop", key: "b" }]))
    expect(pathKey([{ kind: "index", index: 0 }])).not.toBe(pathKey([{ kind: "map-key", index: 0 }]))
    expect(pathKey([{ kind: "prop", key: "a" }, { kind: "index", index: 2 }])).toBe("prop:a/index:2")
  })
})
