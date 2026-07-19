import type { PreviewNode } from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import { compactContainerPreview, isExpandable, pathKey, summarizeNode } from "./preview.js"
import type { ContainerNode } from "./preview.js"

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

  it("formats a recognized component definition as its resolved name, not an object dump", () => {
    expect(summarizeNode({ kind: "component", name: "HomePage", inferred: false, location: null })).toBe("<HomePage>")
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

describe("compactContainerPreview (devtools-style one-line preview)", () => {
  it("inlines an object's shallow entries without a redundant 'Object' label", () => {
    const node: ContainerNode = {
      kind: "object",
      className: "Object",
      size: 3,
      entries: [
        { key: "id", node: { kind: "primitive", type: "number", value: 1 } },
        { key: "label", node: { kind: "primitive", type: "string", value: "Write the changelog" } },
        { key: "done", node: { kind: "primitive", type: "boolean", value: false } },
      ],
      offset: 0,
      truncated: false,
      path: [],
    }
    expect(compactContainerPreview(node)).toBe('{ id: 1, label: "Write the changelog", done: false }')
  })

  it("prefixes a non-generic className", () => {
    const node: ContainerNode = {
      kind: "object",
      className: "User",
      size: 1,
      entries: [{ key: "name", node: { kind: "primitive", type: "string", value: "Ada" } }],
      offset: 0,
      truncated: false,
      path: [],
    }
    expect(compactContainerPreview(node)).toBe('User { name: "Ada" }')
  })

  it("renders empty containers without a dangling space", () => {
    const object: ContainerNode = { kind: "object", className: "Object", size: 0, entries: [], offset: 0, truncated: false, path: [] }
    const array: ContainerNode = { kind: "array", length: 0, items: [], offset: 0, truncated: false, path: [] }
    expect(compactContainerPreview(object)).toBe("{}")
    expect(compactContainerPreview(array)).toBe("[]")
  })

  it("inlines array items positionally, one level deep only", () => {
    const node: ContainerNode = {
      kind: "array",
      length: 2,
      items: [
        { kind: "primitive", type: "number", value: 1 },
        { kind: "object", className: "Object", size: 1, entries: [], offset: 0, truncated: false, path: [] },
      ],
      offset: 0,
      truncated: false,
      path: [],
    }
    expect(compactContainerPreview(node)).toBe("[ 1, Object ]")
  })

  it("caps at 5 entries and trails with an ellipsis when more remain", () => {
    const node: ContainerNode = {
      kind: "array",
      length: 7,
      items: Array.from({ length: 7 }, (_, i) => ({ kind: "primitive" as const, type: "number" as const, value: i })),
      offset: 0,
      truncated: false,
      path: [],
    }
    expect(compactContainerPreview(node)).toBe("[ 0, 1, 2, 3, 4, … ]")
  })

  it("trails with an ellipsis for a truncated container even under the cap", () => {
    const node: ContainerNode = {
      kind: "array",
      length: 100,
      items: [{ kind: "primitive", type: "number", value: 0 }],
      offset: 0,
      truncated: true,
      path: [],
    }
    expect(compactContainerPreview(node)).toBe("[ 0, … ]")
  })

  it("formats map and set entries", () => {
    const map: ContainerNode = {
      kind: "map",
      size: 1,
      entries: [{ key: { kind: "primitive", type: "string", value: "a" }, value: { kind: "primitive", type: "number", value: 1 } }],
      offset: 0,
      truncated: false,
      path: [],
    }
    const set: ContainerNode = {
      kind: "set",
      size: 2,
      items: [
        { kind: "primitive", type: "number", value: 1 },
        { kind: "primitive", type: "number", value: 2 },
      ],
      offset: 0,
      truncated: false,
      path: [],
    }
    expect(compactContainerPreview(map)).toBe('Map(1) { "a" => 1 }')
    expect(compactContainerPreview(set)).toBe("Set(2) { 1, 2 }")
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
