import type {
  PreviewArrayNode,
  PreviewMapNode,
  PreviewObjectNode,
  PreviewPath,
  PreviewSetNode,
  PreviewTypedArrayNode,
  SourceLocation,
} from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import { createSerializer, DEFAULT_REDACTION_KEYS } from "./serializer.js"

describe("createSerializer (§7.4 safe serialization)", () => {
  describe("primitives", () => {
    it("serializes strings, numbers, booleans, null and undefined", () => {
      const serializer = createSerializer()
      expect(serializer.serialize("hi")).toEqual({ kind: "primitive", type: "string", value: "hi" })
      expect(serializer.serialize(42)).toEqual({ kind: "primitive", type: "number", value: 42 })
      expect(serializer.serialize(true)).toEqual({ kind: "primitive", type: "boolean", value: true })
      expect(serializer.serialize(null)).toEqual({ kind: "primitive", type: "null", value: null })
      expect(serializer.serialize(undefined)).toEqual({ kind: "primitive", type: "undefined", value: null })
    })
  })

  describe("bigints", () => {
    it("serializes a bigint as its string form", () => {
      const serializer = createSerializer()
      expect(serializer.serialize(10n)).toEqual({ kind: "bigint", value: "10" })
    })
  })

  describe("symbols", () => {
    it("serializes a symbol's description", () => {
      const serializer = createSerializer()
      expect(serializer.serialize(Symbol("mine"))).toEqual({ kind: "symbol", description: "mine" })
    })

    it("reports a null description for an unnamed symbol", () => {
      const serializer = createSerializer()
      expect(serializer.serialize(Symbol())).toEqual({ kind: "symbol", description: null })
    })
  })

  describe("functions", () => {
    it("serializes a named function's name", () => {
      const serializer = createSerializer()
      function namedFn(): void {}
      expect(serializer.serialize(namedFn)).toEqual({ kind: "function", name: "namedFn" })
    })

    it("serializes an anonymous function with an empty name", () => {
      const serializer = createSerializer()
      expect(serializer.serialize(() => {})).toEqual({ kind: "function", name: "" })
    })
  })

  describe("DOM nodes", () => {
    it("serializes an element's tag name and node type", () => {
      const serializer = createSerializer()
      const div = document.createElement("div")
      expect(serializer.serialize(div)).toEqual({ kind: "dom-node", nodeType: 1, tagName: "div" })
    })

    it("serializes a text node with a null tag name", () => {
      const serializer = createSerializer()
      const text = document.createTextNode("hi")
      expect(serializer.serialize(text)).toEqual({ kind: "dom-node", nodeType: 3, tagName: null })
    })
  })

  describe("Errors", () => {
    it("serializes an error's name and message without a stack leak", () => {
      const serializer = createSerializer()
      const node = serializer.serialize(new TypeError("bad value"))
      expect(node).toEqual({ kind: "error", name: "TypeError", message: "bad value" })
    })
  })

  describe("Promises", () => {
    it("serializes a promise as an opaque marker without awaiting it", () => {
      const serializer = createSerializer()
      expect(serializer.serialize(Promise.resolve(1))).toEqual({ kind: "promise" })
    })
  })

  describe("Maps", () => {
    it("serializes entries with size and preserved key/value pairs", () => {
      const serializer = createSerializer()
      const map = new Map<string, number>([
        ["a", 1],
        ["b", 2],
      ])
      const node = serializer.serialize(map) as PreviewMapNode
      expect(node.kind).toBe("map")
      expect(node.size).toBe(2)
      expect(node.truncated).toBe(false)
      expect(node.entries).toEqual([
        { key: { kind: "primitive", type: "string", value: "a" }, value: { kind: "primitive", type: "number", value: 1 } },
        { key: { kind: "primitive", type: "string", value: "b" }, value: { kind: "primitive", type: "number", value: 2 } },
      ])
    })

    it("serializes a non-string map key", () => {
      const serializer = createSerializer()
      const keyObj = { id: 1 }
      const map = new Map<object, string>([[keyObj, "value"]])
      const node = serializer.serialize(map) as PreviewMapNode
      expect(node.entries[0]?.key.kind).toBe("object")
    })
  })

  describe("Sets", () => {
    it("serializes items with size preserved", () => {
      const serializer = createSerializer()
      const node = serializer.serialize(new Set([1, 2, 3])) as PreviewSetNode
      expect(node.kind).toBe("set")
      expect(node.size).toBe(3)
      expect(node.items).toEqual([
        { kind: "primitive", type: "number", value: 1 },
        { kind: "primitive", type: "number", value: 2 },
        { kind: "primitive", type: "number", value: 3 },
      ])
    })
  })

  describe("typed arrays", () => {
    it("serializes an Int32Array with its constructor name and length", () => {
      const serializer = createSerializer()
      const node = serializer.serialize(new Int32Array([1, 2, 3])) as PreviewTypedArrayNode
      expect(node.kind).toBe("typed-array")
      expect(node.typeName).toBe("Int32Array")
      expect(node.length).toBe(3)
      expect(node.items).toEqual([
        { kind: "primitive", type: "number", value: 1 },
        { kind: "primitive", type: "number", value: 2 },
        { kind: "primitive", type: "number", value: 3 },
      ])
    })
  })

  describe("plain objects and arrays", () => {
    it("serializes a plain object's class name and entries", () => {
      const serializer = createSerializer()
      const node = serializer.serialize({ a: 1, b: "two" }) as PreviewObjectNode
      expect(node.kind).toBe("object")
      expect(node.className).toBe("Object")
      expect(node.size).toBe(2)
      expect(node.entries).toEqual([
        { key: "a", node: { kind: "primitive", type: "number", value: 1 } },
        { key: "b", node: { kind: "primitive", type: "string", value: "two" } },
      ])
    })

    it("serializes a class instance's constructor name", () => {
      class Point {
        constructor(
          public x: number,
          public y: number,
        ) {}
      }
      const serializer = createSerializer()
      const node = serializer.serialize(new Point(1, 2)) as PreviewObjectNode
      expect(node.className).toBe("Point")
    })

    it("serializes an array's length and items", () => {
      const serializer = createSerializer()
      const node = serializer.serialize([1, "two", true]) as PreviewArrayNode
      expect(node.kind).toBe("array")
      expect(node.length).toBe(3)
      expect(node.items).toEqual([
        { kind: "primitive", type: "number", value: 1 },
        { kind: "primitive", type: "string", value: "two" },
        { kind: "primitive", type: "boolean", value: true },
      ])
    })
  })

  describe("circular references", () => {
    it("labels a self-reference with the path back to itself", () => {
      const serializer = createSerializer()
      const obj: Record<string, unknown> = {}
      obj.self = obj
      const node = serializer.serialize(obj) as PreviewObjectNode
      expect(node.entries).toEqual([{ key: "self", node: { kind: "circular", path: [] } }])
    })

    it("labels a cycle through two objects with the path to the actual ancestor", () => {
      const serializer = createSerializer()
      const a: Record<string, unknown> = {}
      const b: Record<string, unknown> = { back: a }
      a.child = b
      const node = serializer.serialize(a) as PreviewObjectNode
      const child = node.entries[0]!.node as PreviewObjectNode
      expect(child.kind).toBe("object")
      expect(child.entries).toEqual([{ key: "back", node: { kind: "circular", path: [] } }])
    })

    it("does not flag a shared (non-circular) sibling reference", () => {
      const serializer = createSerializer()
      const shared = { value: 1 }
      const obj = { a: shared, b: shared }
      const node = serializer.serialize(obj) as PreviewObjectNode
      const aNode = node.entries.find((e) => e.key === "a")!.node as PreviewObjectNode
      const bNode = node.entries.find((e) => e.key === "b")!.node as PreviewObjectNode
      expect(aNode.kind).toBe("object")
      expect(bNode.kind).toBe("object")
      expect(bNode.entries).toEqual([{ key: "value", node: { kind: "primitive", type: "number", value: 1 } }])
    })
  })

  describe("throwing getters", () => {
    it("defers a getter without invoking it during serialize", () => {
      let invoked = false
      const obj = {
        get danger(): number {
          invoked = true
          throw new Error("boom")
        },
        safe: 1,
      }
      const serializer = createSerializer()
      const node = serializer.serialize(obj) as PreviewObjectNode
      expect(invoked).toBe(false)
      expect(node.entries).toEqual([
        { key: "danger", node: { kind: "getter", path: [{ kind: "prop", key: "danger" }] } },
        { key: "safe", node: { kind: "primitive", type: "number", value: 1 } },
      ])
    })

    it("catches a throw during expand and reports it as an error node", () => {
      const obj = {
        get danger(): number {
          throw new Error("boom")
        },
      }
      const serializer = createSerializer()
      const node = serializer.expand(obj, [{ kind: "prop", key: "danger" }])
      expect(node).toEqual({ kind: "error", name: "Error", message: "boom" })
    })

    it("evaluates a non-throwing getter on expand", () => {
      const obj = {
        get computed(): number {
          return 42
        },
      }
      const serializer = createSerializer()
      const node = serializer.expand(obj, [{ kind: "prop", key: "computed" }])
      expect(node).toEqual({ kind: "primitive", type: "number", value: 42 })
    })
  })

  describe("Proxy objects", () => {
    it("catches a get-trap throw for one key without breaking the rest of the object", () => {
      const target = { a: 1, b: 2 }
      const proxy = new Proxy(target, {
        get(t, prop) {
          if (prop === "b") throw new Error("blocked")
          return Reflect.get(t, prop)
        },
      })
      const serializer = createSerializer()
      const node = serializer.serialize(proxy) as PreviewObjectNode
      expect(node.entries).toEqual([
        { key: "a", node: { kind: "primitive", type: "number", value: 1 } },
        { key: "b", node: { kind: "error", name: "Error", message: "blocked" } },
      ])
    })

    it("never throws when ownKeys/getOwnPropertyDescriptor traps throw", () => {
      const proxy = new Proxy(
        {},
        {
          ownKeys() {
            throw new Error("no keys for you")
          },
        },
      )
      const serializer = createSerializer()
      expect(() => serializer.serialize(proxy)).not.toThrow()
      const node = serializer.serialize(proxy) as PreviewObjectNode
      expect(node.kind).toBe("object")
      expect(node.entries).toEqual([])
    })
  })

  describe("deep objects (max depth)", () => {
    it("stubs out a container past maxDepth instead of recursing forever", () => {
      const serializer = createSerializer({ maxDepth: 1 })
      const nested = { a: { b: { c: 1 } } }
      const node = serializer.serialize(nested) as PreviewObjectNode
      const aNode = node.entries[0]!.node
      expect(aNode.kind).toBe("max-depth")
      expect((aNode as { path: PreviewPath }).path).toEqual([{ kind: "prop", key: "a" }])
    })

    it("expand reveals exactly one more level, matching the same depth budget", () => {
      const serializer = createSerializer({ maxDepth: 1 })
      const nested = { a: { b: { c: 1 } } }
      const expanded = serializer.expand(nested, [{ kind: "prop", key: "a" }]) as PreviewObjectNode
      expect(expanded.kind).toBe("object")
      const bNode = expanded.entries[0]!.node
      expect(bNode.kind).toBe("max-depth")
    })

    it("does not overflow the stack on a very deep structure", () => {
      let deep: Record<string, unknown> = { value: 1 }
      for (let i = 0; i < 1000; i += 1) deep = { child: deep }
      const serializer = createSerializer()
      expect(() => serializer.serialize(deep)).not.toThrow()
    })
  })

  describe("describeComponent (task: name component values instead of dumping lifecycle hooks)", () => {
    const location: SourceLocation = {
      moduleId: "m:src/pages/home-page.ts",
      sourceId: "s1",
      absoluteFile: "/project/src/pages/home-page.ts",
      relativeFile: "src/pages/home-page.ts",
      line: 5,
      column: 1,
      kind: "component-declaration",
      displayName: "HomePage",
    }

    it("serializes a recognized component-shaped object as a component node (with its declaration location), bypassing the generic object dump", () => {
      const wrapped = { view: () => null, oninit: () => undefined }
      const serializer = createSerializer({
        describeComponent: (value) => (value === wrapped ? { name: "HomePage", inferred: false, location } : null),
      })
      const node = serializer.serialize({ component: wrapped }) as PreviewObjectNode
      expect(node.entries[0]!.node).toEqual({ kind: "component", name: "HomePage", inferred: false, location })
    })

    it("serializes a recognized component-shaped function as a component node too", () => {
      const wrapped = (): unknown => null
      const serializer = createSerializer({
        describeComponent: (value) => (value === wrapped ? { name: "Counter", inferred: true, location: null } : null),
      })
      expect(serializer.serialize(wrapped)).toEqual({ kind: "component", name: "Counter", inferred: true, location: null })
    })

    it("falls back to the generic object dump when describeComponent returns null", () => {
      const serializer = createSerializer({ describeComponent: () => null })
      const node = serializer.serialize({ view: () => null }) as PreviewObjectNode
      expect(node.kind).toBe("object")
      expect(node.entries[0]!.key).toBe("view")
    })

    it("recognizes a component past maxDepth instead of stubbing it out — a component def is never itself worth a nested object dump", () => {
      const wrapped = { view: () => null }
      const serializer = createSerializer({
        maxDepth: 2,
        describeComponent: (value) => (value === wrapped ? { name: "HomePage", inferred: false, location } : null),
      })
      const node = serializer.serialize({ a: { component: wrapped } }) as PreviewObjectNode
      const aNode = node.entries[0]!.node as PreviewObjectNode
      expect(aNode.kind).toBe("object")
      expect(aNode.entries[0]!.node).toEqual({ kind: "component", name: "HomePage", inferred: false, location })
    })
  })

  describe("very large objects (pagination)", () => {
    it("truncates entries beyond maxEntries and reports the true size", () => {
      const serializer = createSerializer({ maxEntries: 3 })
      const big: Record<string, number> = {}
      for (let i = 0; i < 1000; i += 1) big[`k${i}`] = i
      const node = serializer.serialize(big) as PreviewObjectNode
      expect(node.size).toBe(1000)
      expect(node.entries).toHaveLength(3)
      expect(node.truncated).toBe(true)
    })

    it("pages through an array's next window via expand + offset", () => {
      const serializer = createSerializer({ maxEntries: 3 })
      const arr = Array.from({ length: 10 }, (_, i) => i)
      const first = serializer.serialize(arr) as PreviewArrayNode
      expect(first.items.map((n) => (n as { value: number }).value)).toEqual([0, 1, 2])
      expect(first.truncated).toBe(true)

      const second = serializer.expand(arr, [], { offset: 3 }) as PreviewArrayNode
      expect(second.offset).toBe(3)
      expect(second.items.map((n) => (n as { value: number }).value)).toEqual([3, 4, 5])
      expect(second.truncated).toBe(true)

      const last = serializer.expand(arr, [], { offset: 9 }) as PreviewArrayNode
      expect(last.items.map((n) => (n as { value: number }).value)).toEqual([9])
      expect(last.truncated).toBe(false)
    })
  })

  describe("redaction (§15)", () => {
    it("redacts default key patterns case-insensitively", () => {
      const serializer = createSerializer()
      const node = serializer.serialize({
        password: "hunter2",
        PASSWORD_HASH: "x",
        apiKey: "k",
        username: "bob",
      }) as PreviewObjectNode
      expect(node.entries).toEqual([
        { key: "password", node: { kind: "redacted", replacement: "[redacted]" } },
        { key: "PASSWORD_HASH", node: { kind: "redacted", replacement: "[redacted]" } },
        { key: "apiKey", node: { kind: "redacted", replacement: "[redacted]" } },
        { key: "username", node: { kind: "primitive", type: "string", value: "bob" } },
      ])
    })

    it("includes every documented default pattern", () => {
      expect(DEFAULT_REDACTION_KEYS).toEqual([
        "password",
        "passwd",
        "secret",
        "token",
        "authorization",
        "cookie",
        "apiKey",
        "accessToken",
        "refreshToken",
      ])
    })

    it("matches patterns as whole words, not a raw substring", () => {
      const serializer = createSerializer()
      const node = serializer.serialize({
        tokens: ["a", "b"],
        tokenizer: "whitespace",
        authToken: "abc123",
        api_token: "def456",
        TOKEN: "ghi789",
      }) as PreviewObjectNode
      expect(node.entries).toEqual([
        { key: "tokens", node: { kind: "array", length: 2, items: expect.any(Array), offset: 0, truncated: false, path: [{ kind: "prop", key: "tokens" }] } },
        { key: "tokenizer", node: { kind: "primitive", type: "string", value: "whitespace" } },
        { key: "authToken", node: { kind: "redacted", replacement: "[redacted]" } },
        { key: "api_token", node: { kind: "redacted", replacement: "[redacted]" } },
        { key: "TOKEN", node: { kind: "redacted", replacement: "[redacted]" } },
      ])
    })

    it("never evaluates a getter for a redacted key", () => {
      let invoked = false
      const serializer = createSerializer()
      const obj = {
        get password(): string {
          invoked = true
          return "leaked"
        },
      }
      serializer.serialize(obj)
      expect(invoked).toBe(false)
    })

    it("replaces the default key list (not merges) when configured, using the custom replacement", () => {
      const serializer = createSerializer({ redactKeys: ["ssn"], replacement: "***" })
      const node = serializer.serialize({ ssn: "123-45-6789", password: "still-here" }) as PreviewObjectNode
      expect(node.entries).toEqual([
        { key: "ssn", node: { kind: "redacted", replacement: "***" } },
        { key: "password", node: { kind: "primitive", type: "string", value: "still-here" } },
      ])
    })

    it("skips redaction entirely while isRedactionEnabled() returns false (Settings tab toggle)", () => {
      let enabled = true
      const serializer = createSerializer({ isRedactionEnabled: () => enabled })
      const value = { password: "hunter2" }
      expect((serializer.serialize(value) as PreviewObjectNode).entries).toEqual([
        { key: "password", node: { kind: "redacted", replacement: "[redacted]" } },
      ])

      enabled = false
      expect((serializer.serialize(value) as PreviewObjectNode).entries).toEqual([
        { key: "password", node: { kind: "primitive", type: "string", value: "hunter2" } },
      ])

      enabled = true
      expect((serializer.serialize(value) as PreviewObjectNode).entries).toEqual([
        { key: "password", node: { kind: "redacted", replacement: "[redacted]" } },
      ])
    })

    it("also redacts a live-added key on top of the configured patterns (Settings tab)", () => {
      let extra: readonly string[] = []
      const serializer = createSerializer({ redactKeys: ["password"], additionalRedactKeys: () => extra })
      const value = { password: "hunter2", ssn: "123-45-6789" }
      expect((serializer.serialize(value) as PreviewObjectNode).entries).toEqual([
        { key: "password", node: { kind: "redacted", replacement: "[redacted]" } },
        { key: "ssn", node: { kind: "primitive", type: "string", value: "123-45-6789" } },
      ])

      extra = ["ssn"]
      expect((serializer.serialize(value) as PreviewObjectNode).entries).toEqual([
        { key: "password", node: { kind: "redacted", replacement: "[redacted]" } },
        { key: "ssn", node: { kind: "redacted", replacement: "[redacted]" } },
      ])
    })

    it("refuses to descend into a redacted key even via expand (no back-door leak)", () => {
      const serializer = createSerializer()
      const obj = { password: { inner: "leaked" } }
      const node = serializer.expand(obj, [
        { kind: "prop", key: "password" },
        { kind: "prop", key: "inner" },
      ])
      expect(node).toEqual({ kind: "redacted", replacement: "[redacted]" })
    })

    it("redacts a Map entry's value when its string key matches a pattern, keeping the key visible", () => {
      const serializer = createSerializer()
      const map = new Map<string, string>([
        ["token", "abc123"],
        ["username", "bob"],
      ])
      const node = serializer.serialize(map) as PreviewMapNode
      expect(node.entries[0]).toEqual({
        key: { kind: "primitive", type: "string", value: "token" },
        value: { kind: "redacted", replacement: "[redacted]" },
      })
      expect(node.entries[1]).toEqual({
        key: { kind: "primitive", type: "string", value: "username" },
        value: { kind: "primitive", type: "string", value: "bob" },
      })
    })

    it("refuses to descend into a redacted Map value via expand (no back-door leak)", () => {
      const serializer = createSerializer()
      const map = new Map<string, object>([["token", { inner: "leaked" }]])
      const node = serializer.expand(map, [
        { kind: "map-value", index: 0 },
        { kind: "prop", key: "inner" },
      ])
      expect(node).toEqual({ kind: "redacted", replacement: "[redacted]" })
    })
  })
})
