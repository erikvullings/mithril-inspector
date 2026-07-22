import type { PreviewNode } from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import {
  compactContainerPreview,
  containerNeedsToggle,
  formatIndexLabel,
  isExpandable,
  isNullOrUndefinedNode,
  pathKey,
  summarizeNode,
} from "./preview.js"
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

  it("renders empty containers without a dangling space, and without a redundant count prefix (nothing hidden to expand)", () => {
    const object: ContainerNode = { kind: "object", className: "Object", size: 0, entries: [], offset: 0, truncated: false, path: [] }
    const array: ContainerNode = { kind: "array", length: 0, items: [], offset: 0, truncated: false, path: [] }
    expect(compactContainerPreview(object)).toBe("{}")
    expect(compactContainerPreview(array)).toBe("[]")
  })

  it("inlines array items positionally, one level deep only, prefixed with an Array(N) count", () => {
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
    expect(compactContainerPreview(node)).toBe("Array(2) [ 1, Object ]")
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
    expect(compactContainerPreview(node)).toBe("Array(7) [ 0, 1, 2, 3, 4, … ]")
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
    expect(compactContainerPreview(node)).toBe("Array(100) [ 0, … ]")
  })

  it("formats map and set entries, omitting the count prefix when every entry is already shown", () => {
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
    expect(compactContainerPreview(map)).toBe('{ "a" => 1 }')
    expect(compactContainerPreview(set)).toBe("{ 1, 2 }")
  })

  it("keeps the count prefix once entries are elided past the cap", () => {
    const map: ContainerNode = {
      kind: "map",
      size: 6,
      entries: Array.from({ length: 6 }, (_, i) => ({
        key: { kind: "primitive" as const, type: "string" as const, value: `k${i}` },
        value: { kind: "primitive" as const, type: "number" as const, value: i },
      })),
      offset: 0,
      truncated: false,
      path: [],
    }
    expect(compactContainerPreview(map)).toBe('Map(6) { "k0" => 0, "k1" => 1, "k2" => 2, "k3" => 3, "k4" => 4, … }')
  })
})

describe("containerNeedsToggle (only show +/- when expanding reveals something new)", () => {
  it("is false for a plain object with only primitive-leaf fields — nothing more to reveal", () => {
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
    expect(containerNeedsToggle(node)).toBe(false)
  })

  it("is false for a fully-shown array of primitives, e.g. a single-item array (grammarSlugs: [ \"personal-pronouns\" ])", () => {
    const array: ContainerNode = {
      kind: "array",
      length: 1,
      items: [{ kind: "primitive", type: "string", value: "personal-pronouns" }],
      offset: 0,
      truncated: false,
      path: [],
    }
    expect(containerNeedsToggle(array)).toBe(false)
  })

  it("is true once a container's entries are elided past the cap, or it's server-truncated", () => {
    const capped: ContainerNode = {
      kind: "array",
      length: 7,
      items: Array.from({ length: 7 }, (_, i) => ({ kind: "primitive" as const, type: "number" as const, value: i })),
      offset: 0,
      truncated: false,
      path: [],
    }
    const truncated: ContainerNode = {
      kind: "object",
      className: "Object",
      size: 100,
      entries: [{ key: "id", node: { kind: "primitive", type: "number", value: 1 } }],
      offset: 0,
      truncated: true,
      path: [],
    }
    expect(containerNeedsToggle(capped)).toBe(true)
    expect(containerNeedsToggle(truncated)).toBe(true)
  })

  it("is true whenever any entry is itself a container or a getter/max-depth stub, even under the cap", () => {
    const nested: ContainerNode = {
      kind: "object",
      className: "Object",
      size: 1,
      entries: [
        { key: "meta", node: { kind: "object", className: "Object", size: 0, entries: [], offset: 0, truncated: false, path: [] } },
      ],
      offset: 0,
      truncated: false,
      path: [],
    }
    const getter: ContainerNode = {
      kind: "object",
      className: "Object",
      size: 1,
      entries: [{ key: "value", node: { kind: "getter", path: [] } }],
      offset: 0,
      truncated: false,
      path: [],
    }
    const arrayOfObjects: ContainerNode = {
      kind: "array",
      length: 1,
      items: [{ kind: "object", className: "Task", size: 1, entries: [], offset: 0, truncated: false, path: [] }],
      offset: 0,
      truncated: false,
      path: [],
    }
    expect(containerNeedsToggle(nested)).toBe(true)
    expect(containerNeedsToggle(getter)).toBe(true)
    expect(containerNeedsToggle(arrayOfObjects)).toBe(true)
  })

  it("is true when an entry is a component reference with a resolved location — the click-to-open link only exists on its own row, not in the compact text", () => {
    const withComponent: ContainerNode = {
      kind: "object",
      className: "Object",
      size: 1,
      entries: [
        {
          key: "component",
          node: {
            kind: "component",
            name: "HomePage",
            inferred: false,
            location: {
              moduleId: "m:home",
              sourceId: "s1",
              absoluteFile: "/p/home.tsx",
              relativeFile: "home.tsx",
              line: 1,
              column: 1,
              kind: "component-declaration",
            },
          },
        },
      ],
      offset: 0,
      truncated: false,
      path: [],
    }
    const unresolvedComponent: ContainerNode = {
      kind: "object",
      className: "Object",
      size: 1,
      entries: [{ key: "component", node: { kind: "component", name: "HomePage", inferred: false, location: null } }],
      offset: 0,
      truncated: false,
      path: [],
    }
    expect(containerNeedsToggle(withComponent)).toBe(true)
    expect(containerNeedsToggle(unresolvedComponent)).toBe(false)
  })

  it("is unaffected by a class instance's name alone — className doesn't gate the toggle", () => {
    const classInstance: ContainerNode = {
      kind: "object",
      className: "User",
      size: 1,
      entries: [{ key: "name", node: { kind: "primitive", type: "string", value: "Ada" } }],
      offset: 0,
      truncated: false,
      path: [],
    }
    expect(containerNeedsToggle(classInstance)).toBe(false)
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

describe("isNullOrUndefinedNode (hide-empty-attrs/state follow-up)", () => {
  it("is true for serialized null and undefined values", () => {
    expect(isNullOrUndefinedNode({ kind: "primitive", type: "null", value: null })).toBe(true)
    expect(isNullOrUndefinedNode({ kind: "primitive", type: "undefined", value: null })).toBe(true)
  })

  it("is false for other primitives and containers", () => {
    expect(isNullOrUndefinedNode({ kind: "primitive", type: "boolean", value: false })).toBe(false)
    expect(isNullOrUndefinedNode({ kind: "primitive", type: "number", value: 0 })).toBe(false)
    expect(isNullOrUndefinedNode({ kind: "primitive", type: "string", value: "" })).toBe(false)
    expect(
      isNullOrUndefinedNode({
        kind: "object",
        className: "Object",
        entries: [],
        truncated: false,
        offset: 0,
        size: 0,
        path: [],
      }),
    ).toBe(false)
  })
})

describe("formatIndexLabel (zero-padded array index labels follow-up)", () => {
  it("leaves labels unpadded at or below 10 items", () => {
    expect(formatIndexLabel(0, 1)).toBe("0")
    expect(formatIndexLabel(9, 10)).toBe("9")
  })

  it("pads to 2 digits once the array holds more than 10 items", () => {
    expect(formatIndexLabel(0, 11)).toBe("00")
    expect(formatIndexLabel(1, 11)).toBe("01")
    expect(formatIndexLabel(9, 11)).toBe("09")
    expect(formatIndexLabel(10, 11)).toBe("10")
  })

  it("pads to 3 digits once the array holds more than 100 items", () => {
    expect(formatIndexLabel(0, 101)).toBe("000")
    expect(formatIndexLabel(7, 101)).toBe("007")
    expect(formatIndexLabel(99, 101)).toBe("099")
    expect(formatIndexLabel(100, 101)).toBe("100")
  })
})
