import type { ComponentId } from "@mithril-inspector/protocol"
import { describe, expect, it } from "vitest"

import {
  buildChildBoundaries,
  buildElementsTree,
  formatElementLabel,
  formatInlineText,
  formatInlineTextList,
  type ChildBoundary,
  type ChildRecordLike,
  type ElementsPaneNode,
} from "./elements.js"

/** Narrows a node to its `children` array, or fails loudly — every fixture below expects an element at this position. */
function elementChildren(node: ElementsPaneNode | undefined): readonly ElementsPaneNode[] {
  if (node === undefined || node.kind !== "element") throw new Error(`expected an element node, got ${JSON.stringify(node)}`)
  return node.children
}

/**
 * Drops `domNode` (the live DOM reference each element/text row now carries
 * for "jump to source") before a `toEqual` shape comparison — the tests below
 * that aren't specifically about `domNode` care about tag/id/classes/
 * inlineText/children, not which exact node instance is attached; dedicated
 * tests further down assert `domNode` identity directly instead.
 */
function stripDomNodes(nodes: readonly ElementsPaneNode[]): unknown[] {
  return nodes.map((node) => {
    if (node.kind === "element") {
      const { domNode: _domNode, children, ...rest } = node
      return { ...rest, children: stripDomNodes(children) }
    }
    if (node.kind === "text") {
      const { domNode: _domNode, ...rest } = node
      return rest
    }
    return node
  })
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

describe("formatInlineText (task 0031: inline text children on the owning element's own row)", () => {
  it("trims and never quotes ordinary content", () => {
    expect(formatInlineText("Attrs demo")).toBe("Attrs demo")
    expect(formatInlineText("  padded  ")).toBe("padded")
  })

  it("quotes pure whitespace so a deliberate separator isn't otherwise invisible", () => {
    expect(formatInlineText(" ")).toBe('" "')
  })

  it("escapes a whitespace-only tab/newline via JSON.stringify rather than showing raw, invisible whitespace", () => {
    expect(formatInlineText("\t")).toBe('"\\t"')
    expect(formatInlineText("\n")).toBe('"\\n"')
  })
})

describe("formatInlineTextList (task 0031)", () => {
  it("returns null for no segments", () => {
    expect(formatInlineTextList([])).toBeNull()
  })

  it("formats a single segment the same as formatInlineText", () => {
    expect(formatInlineTextList(["Name:"])).toBe("Name:")
  })

  it("joins multiple segments with a single space, formatting each independently", () => {
    expect(formatInlineTextList(["Click", " ", "me"])).toBe('Click " " me')
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
  it("renders a leaf element's own text inline (inlineText), not as a separate nested child", () => {
    const root = document.createElement("div")
    root.id = "app"
    root.className = "scroll"
    const h2 = document.createElement("h2")
    h2.appendChild(document.createTextNode("Attrs demo"))
    root.appendChild(h2)

    const result = buildElementsTree({ first: root, last: root }, new Map())
    expect(result.truncated).toBe(false)
    expect(stripDomNodes(result.nodes)).toEqual([
      {
        kind: "element",
        tag: "div",
        id: "app",
        classes: ["scroll"],
        inlineText: [],
        children: [{ kind: "element", tag: "h2", id: null, classes: [], inlineText: ["Attrs demo"], children: [] }],
      },
    ])
  })

  it("attaches the actual DOM element/text-node reference for click-to-source, on both an element row and a standalone top-level text row", () => {
    const el = document.createElement("span")
    const elResult = buildElementsTree({ first: el, last: el }, new Map())
    const [elNode] = elResult.nodes
    if (elNode === undefined || elNode.kind !== "element") throw new Error("expected an element node")
    expect(elNode.domNode).toBe(el)

    const textNode = document.createTextNode("standalone")
    document.createElement("div").appendChild(textNode) // give it a parent, as a real range's node would have
    const textResult = buildElementsTree({ first: textNode, last: textNode }, new Map())
    const [standaloneText] = textResult.nodes
    if (standaloneText === undefined || standaloneText.kind !== "text") throw new Error("expected a text node")
    expect(standaloneText.domNode).toBe(textNode)
  })

  it("keeps a text child alongside an element child on the same node — inlineText and children coexist", () => {
    // Mirrors a real <label>"Name:"<input></label>: the text renders inline
    // on the label's own row, the input still nests underneath it.
    const label = document.createElement("label")
    label.appendChild(document.createTextNode("Name:"))
    const input = document.createElement("input")
    input.id = "name-input"
    label.appendChild(input)

    const result = buildElementsTree({ first: label, last: label }, new Map())
    expect(stripDomNodes(result.nodes)).toEqual([
      {
        kind: "element",
        tag: "label",
        id: null,
        classes: [],
        inlineText: ["Name:"],
        children: [{ kind: "element", tag: "input", id: "name-input", classes: [], inlineText: [], children: [] }],
      },
    ])
  })

  it("keeps a whitespace-only text child (a deliberate separator) rather than dropping it, truncates long meaningful text", () => {
    const root = document.createElement("div")
    root.appendChild(document.createTextNode("   \n  "))
    root.appendChild(document.createTextNode("x".repeat(60)))
    const result = buildElementsTree({ first: root, last: root }, new Map())
    const [node] = result.nodes
    if (node === undefined || node.kind !== "element") throw new Error("expected an element node")
    expect(node.children).toEqual([])
    expect(node.inlineText).toEqual(["   \n  ", `${"x".repeat(40)}…`])
  })

  it("skips a genuinely empty text node (no content at all, not even whitespace)", () => {
    const root = document.createElement("div")
    root.appendChild(document.createTextNode(""))
    root.appendChild(document.createElement("span"))
    const result = buildElementsTree({ first: root, last: root }, new Map())
    const children = elementChildren(result.nodes[0])
    expect(stripDomNodes(children)).toEqual([{ kind: "element", tag: "span", id: null, classes: [], inlineText: [], children: [] }])
  })

  it("skips comment nodes entirely", () => {
    const root = document.createElement("div")
    root.appendChild(document.createComment("a comment"))
    root.appendChild(document.createElement("span"))
    const result = buildElementsTree({ first: root, last: root }, new Map())
    const children = elementChildren(result.nodes[0])
    expect(stripDomNodes(children)).toEqual([{ kind: "element", tag: "span", id: null, classes: [], inlineText: [], children: [] }])
  })

  it("walks multiple top-level sibling nodes spanned by a fragment-root component's own range", () => {
    const parent = document.createElement("div")
    const a = document.createElement("span")
    const b = document.createElement("span")
    parent.appendChild(a)
    parent.appendChild(b)
    const result = buildElementsTree({ first: a, last: b }, new Map())
    expect(stripDomNodes(result.nodes)).toEqual([
      { kind: "element", tag: "span", id: null, classes: [], inlineText: [], children: [] },
      { kind: "element", tag: "span", id: null, classes: [], inlineText: [], children: [] },
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
    expect(stripDomNodes(children)).toEqual([
      { kind: "element", tag: "p", id: null, classes: [], inlineText: [], children: [] },
      { kind: "component", componentId: "c:9", displayName: "ChildA" },
      { kind: "element", tag: "p", id: null, classes: [], inlineText: ["after"], children: [] },
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
    expect(stripDomNodes(children)).toEqual([
      { kind: "component", componentId: "c:a", displayName: "RowA" },
      { kind: "element", tag: "hr", id: null, classes: [], inlineText: [], children: [] },
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
    expect(stripDomNodes(elementChildren(result.nodes[0]))).toEqual([
      { kind: "element", tag: "span", id: null, classes: [], inlineText: [], children: [] },
    ])
  })

  it("returns no nodes when the range's first node is null", () => {
    const result = buildElementsTree({ first: null, last: null }, new Map())
    expect(result).toEqual({ nodes: [], truncated: false })
  })
})
