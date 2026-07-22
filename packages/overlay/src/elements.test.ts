import type { ComponentId } from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import {
  buildChildBoundaries,
  buildElementsTree,
  formatElementLabel,
  type ChildBoundary,
  type ChildRecordLike,
  type ElementsPaneNode,
} from "./elements.js"

/** Narrows a node to its `children` array, or fails loudly — every fixture below expects an element at this position. */
function elementChildren(node: ElementsPaneNode | undefined): readonly ElementsPaneNode[] {
  if (node === undefined || node.kind !== "element") throw new Error(`expected an element node, got ${JSON.stringify(node)}`)
  return node.children
}

describe("formatElementLabel (task 0031, §9.1 hyperscript shorthand)", () => {
  it("renders tag#id.class.class when showTagName is on", () => {
    expect(formatElementLabel("div", "app", ["scroll", "wide"], true)).toBe("div#app.scroll.wide")
  })

  it("omits the tag when showTagName is off, keeping #id.class", () => {
    expect(formatElementLabel("div", "app", ["scroll"], false)).toBe("#app.scroll")
  })

  it("renders a bare tag with no id/classes", () => {
    expect(formatElementLabel("span", null, [], true)).toBe("span")
  })

  it("falls back to the tag name when showTagName is off and there is no id/class to show (never a blank label)", () => {
    expect(formatElementLabel("div", null, [], false)).toBe("div")
  })

  it("omits an empty-string id the same as a null id", () => {
    expect(formatElementLabel("div", "", ["scroll"], true)).toBe("div.scroll")
  })
})

describe("buildChildBoundaries (task 0031)", () => {
  const childRecord = (overrides: Partial<ChildRecordLike> & { id: ComponentId }): ChildRecordLike => ({
    displayName: "Row",
    domRange: null,
    ...overrides,
  })

  it("keys a boundary by the child's domRange.first node", () => {
    const first = document.createElement("li")
    const boundaries = buildChildBoundaries([childRecord({ id: "c:2" as ComponentId, domRange: { first, last: first } })])
    expect(boundaries.get(first)).toEqual({ componentId: "c:2", displayName: "Row", last: first })
  })

  it("skips a child with a null domRange or a null first node", () => {
    const boundaries = buildChildBoundaries([
      childRecord({ id: "c:2" as ComponentId, domRange: null }),
      childRecord({ id: "c:3" as ComponentId, displayName: "Empty", domRange: { first: null, last: null } }),
    ])
    expect(boundaries.size).toBe(0)
  })
})

describe("buildElementsTree (task 0031, §9.1 optional 'owned vnode/element tree' expansion)", () => {
  it("renders a simple element/text/element structure", () => {
    const root = document.createElement("div")
    root.id = "app"
    root.className = "scroll"
    const span = document.createElement("span")
    span.appendChild(document.createTextNode("hello"))
    root.appendChild(span)

    const result = buildElementsTree({ first: root, last: root }, new Map())
    expect(result.truncated).toBe(false)
    expect(result.nodes).toEqual([
      {
        kind: "element",
        tag: "div",
        id: "app",
        classes: ["scroll"],
        children: [{ kind: "element", tag: "span", id: null, classes: [], children: [{ kind: "text", text: "hello" }] }],
      },
    ])
  })

  it("omits whitespace-only text nodes but keeps meaningful ones, truncating long text", () => {
    const root = document.createElement("div")
    root.appendChild(document.createTextNode("   \n  "))
    root.appendChild(document.createTextNode("x".repeat(60)))
    const result = buildElementsTree({ first: root, last: root }, new Map())
    const children = elementChildren(result.nodes[0])
    expect(children).toEqual([{ kind: "text", text: `${"x".repeat(40)}…` }])
  })

  it("skips comment nodes entirely", () => {
    const root = document.createElement("div")
    root.appendChild(document.createComment("a comment"))
    root.appendChild(document.createElement("span"))
    const result = buildElementsTree({ first: root, last: root }, new Map())
    const children = elementChildren(result.nodes[0])
    expect(children).toEqual([{ kind: "element", tag: "span", id: null, classes: [], children: [] }])
  })

  it("walks multiple top-level sibling nodes spanned by a fragment-root component's own range", () => {
    const parent = document.createElement("div")
    const a = document.createElement("span")
    const b = document.createElement("span")
    parent.appendChild(a)
    parent.appendChild(b)
    const result = buildElementsTree({ first: a, last: b }, new Map())
    expect(result.nodes).toEqual([
      { kind: "element", tag: "span", id: null, classes: [], children: [] },
      { kind: "element", tag: "span", id: null, classes: [], children: [] },
    ])
  })

  it("renders a node matching a child component's domRange.first as a link instead of descending into it", () => {
    const parent = document.createElement("ul")
    const childRoot = document.createElement("li")
    childRoot.appendChild(document.createElement("span")) // must not appear in the output
    parent.appendChild(childRoot)
    const boundaries = new Map<Node, ChildBoundary>([
      [childRoot, { componentId: "c:2" as ComponentId, displayName: "Row", last: childRoot }],
    ])
    const result = buildElementsTree({ first: parent, last: parent }, boundaries)
    const children = elementChildren(result.nodes[0])
    expect(children).toEqual([{ kind: "component", componentId: "c:2", displayName: "Row" }])
  })

  it("skips every sibling spanned by a fragment-root child's own range, not just its first node, and resumes correctly afterward", () => {
    // Parent renders: [plain <p>, ChildA-first <span>, ChildA-last <span>, plain <p> "after"] —
    // a two-node fragment-root child sitting between two ordinary siblings.
    // A boundary check keyed only on the first node (without skipping to `last`)
    // would leak ChildA's second node into the output as if it were the
    // parent's own plain DOM, right after the link chip.
    const parent = document.createElement("div")
    const before = document.createElement("p")
    const childFirst = document.createElement("span")
    const childLast = document.createElement("span")
    const after = document.createElement("p")
    after.appendChild(document.createTextNode("after"))
    parent.append(before, childFirst, childLast, after)

    const boundaries = new Map<Node, ChildBoundary>([
      [childFirst, { componentId: "c:9" as ComponentId, displayName: "ChildA", last: childLast }],
    ])
    const result = buildElementsTree({ first: parent, last: parent }, boundaries)
    const children = elementChildren(result.nodes[0])
    expect(children).toEqual([
      { kind: "element", tag: "p", id: null, classes: [], children: [] },
      { kind: "component", componentId: "c:9", displayName: "ChildA" },
      { kind: "element", tag: "p", id: null, classes: [], children: [{ kind: "text", text: "after" }] },
    ])
  })

  it("handles two different sibling child-component boundaries interleaved with plain DOM, not just one in isolation", () => {
    // This repo's own multi-group TDD guidance (see redraw-flash.test.ts's
    // interleaved-records test): a single-boundary fixture can pass even if
    // the lookup silently assumed there'd only ever be one match per level.
    const parent = document.createElement("ul")
    const rowA = document.createElement("li")
    const spacer = document.createElement("hr")
    const rowB = document.createElement("li")
    parent.append(rowA, spacer, rowB)

    const boundaries = new Map<Node, ChildBoundary>([
      [rowA, { componentId: "c:a" as ComponentId, displayName: "RowA", last: rowA }],
      [rowB, { componentId: "c:b" as ComponentId, displayName: "RowB", last: rowB }],
    ])
    const result = buildElementsTree({ first: parent, last: parent }, boundaries)
    const children = elementChildren(result.nodes[0])
    expect(children).toEqual([
      { kind: "component", componentId: "c:a", displayName: "RowA" },
      { kind: "element", tag: "hr", id: null, classes: [], children: [] },
      { kind: "component", componentId: "c:b", displayName: "RowB" },
    ])
  })

  it("caps the total node count, degrading to a truncated partial result instead of hanging on a huge subtree", () => {
    const root = document.createElement("div")
    for (let i = 0; i < 20; i += 1) root.appendChild(document.createElement("span"))
    const result = buildElementsTree({ first: root, last: root }, new Map(), { maxNodes: 5, maxDepth: 40 })
    expect(result.truncated).toBe(true)
    // 1 for the root div itself, leaving 4 of the 20 spans.
    expect(elementChildren(result.nodes[0])).toHaveLength(4)
  })

  it("caps recursion depth, rendering the deepest allowed element with empty children rather than recursing further", () => {
    const root = document.createElement("div")
    const inner = document.createElement("span")
    root.appendChild(inner)
    const result = buildElementsTree({ first: root, last: root }, new Map(), { maxNodes: 500, maxDepth: 1 })
    expect(result.truncated).toBe(true)
    // depth 0 is the root itself; its child (depth 1) hits the cap and is rendered leaf-only.
    expect(elementChildren(result.nodes[0])).toEqual([{ kind: "element", tag: "span", id: null, classes: [], children: [] }])
  })

  it("returns no nodes when the range's first node is null", () => {
    const result = buildElementsTree({ first: null, last: null }, new Map())
    expect(result).toEqual({ nodes: [], truncated: false })
  })
})
