import type { PreviewComponentNode, PreviewNode, PreviewPath } from "@mithril-inspector/protocol"

/**
 * Pure formatting helpers for the safe-serializer preview tree (§7.4, §15,
 * task 0020). The overlay renders `PreviewNode`s directly; this module only
 * turns one node into display text and decides which nodes need a
 * click-to-expand round-trip through the runtime's `expandPreview` (getters,
 * `max-depth` stubs, and truncated container pages) versus rendering inline.
 */

/** Stable string key for a `PreviewPath`, used to key expand-state maps (§7.4). */
export function pathKey(path: PreviewPath): string {
  return path
    .map((segment) => {
      switch (segment.kind) {
        case "prop":
          return `prop:${segment.key}`
        case "index":
          return `index:${segment.index}`
        case "map-key":
          return `map-key:${segment.index}`
        case "map-value":
          return `map-value:${segment.index}`
      }
    })
    .join("/")
}

/** Whether `node` needs a click-to-expand round-trip through `expandPreview` (§7.4). */
export function isExpandable(node: PreviewNode): boolean {
  if (node.kind === "getter" || node.kind === "max-depth") return true
  return "truncated" in node && node.truncated
}

/** Whether `node` is the serialized form of a JS `null`/`undefined` value, e.g. a component with no state field. */
export function isNullOrUndefinedNode(node: PreviewNode): boolean {
  return node.kind === "primitive" && (node.type === "null" || node.type === "undefined")
}

/**
 * Whether a preview node genuinely carries nothing worth showing: absent,
 * JS `null`/`undefined`, or a fully-loaded container with zero entries — used
 * to decide whether a whole attrs/state History swimlane is worth showing at
 * all (task 0027 follow-up). A plain-object component with no closure state
 * of its own still gets a Mithril-allocated state object with zero own
 * properties, which serializes to exactly this: not absent, just empty.
 */
export function isEmptyPreviewValue(node: PreviewNode | null): boolean {
  if (node === null) return true
  if (isNullOrUndefinedNode(node)) return true
  if (isContainerNode(node)) return !node.truncated && totalCountOf(node) === 0
  return false
}

export type ContainerNode = Extract<PreviewNode, { kind: "object" | "array" | "map" | "set" | "typed-array" }>

export function isContainerNode(node: PreviewNode): node is ContainerNode {
  switch (node.kind) {
    case "object":
    case "array":
    case "map":
    case "set":
    case "typed-array":
      return true
    default:
      return false
  }
}

/** A container's own direct child nodes, regardless of kind — used by {@link containerNeedsToggle}. */
function childNodesOf(node: ContainerNode): readonly PreviewNode[] {
  switch (node.kind) {
    case "object":
      return node.entries.map((entry) => entry.node)
    case "map":
      return node.entries.flatMap((entry) => [entry.key, entry.value])
    case "array":
    case "typed-array":
    case "set":
      return node.items
  }
}

/** Whether `node` is a component reference the UI can open in the editor — only reachable via its own expanded row, never from flat `summarizeNode` text (see {@link containerNeedsToggle}). */
function isClickableComponentNode(node: PreviewNode): boolean {
  return node.kind === "component" && node.location !== null
}

/**
 * Whether expanding `node` would reveal anything not already visible in its
 * collapsed `compactContainerPreview` summary — i.e. whether a "+"
 * expand/collapse toggle is worth showing at all. False when the compact
 * preview already spells out every entry in full (nothing paginated away,
 * no entry count elided past {@link COMPACT_PREVIEW_MAX_ENTRIES}) and none
 * of those entries is itself a container, a getter/max-depth stub, or a
 * clickable component reference — e.g. `grammarSlugs: [
 * "personal-pronouns" ]` needs no toggle, the compact form already is the
 * full picture. A container whose count is hidden, that holds a nested
 * container/expandable value only reachable by expanding this one first, or
 * that holds a component reference (whose click-to-open affordance only
 * exists on its own expanded row, not in the compact text) still needs the
 * toggle.
 */
export function containerNeedsToggle(node: ContainerNode): boolean {
  if (node.truncated) return true
  if (totalCountOf(node) > COMPACT_PREVIEW_MAX_ENTRIES) return true
  return childNodesOf(node).some((child) => isContainerNode(child) || isExpandable(child) || isClickableComponentNode(child))
}

/** How many entries/items a container has already fetched, for the "N more" pagination label. */
export function shownCountOf(node: ContainerNode): number {
  if (node.kind === "object" || node.kind === "map") return node.entries.length
  return node.items.length
}

export function totalCountOf(node: ContainerNode): number {
  if (node.kind === "object" || node.kind === "map" || node.kind === "set") return node.size
  return node.length
}

/**
 * Zero-padded index label for an array/typed-array item, e.g. "07" instead
 * of "7" once the array holds more than 10 items, so labels stay aligned as
 * a column once the entries wrap onto their own lines. `total` is the
 * container's full length (not just what's been fetched so far), so the
 * padding width doesn't shift as more items are paged in.
 */
export function formatIndexLabel(index: number, total: number): string {
  const width = total > 100 ? 3 : total > 10 ? 2 : 0
  return width === 0 ? `${index}` : String(index).padStart(width, "0")
}

/** How many entries/items {@link compactContainerPreview} inlines before falling back to a trailing "…". */
const COMPACT_PREVIEW_MAX_ENTRIES = 5

/**
 * One piece of a compact container preview (§7.4): either literal text, or a
 * `component`-kind child rendered as its own segment instead of being folded
 * into surrounding text — lets a caller (the overlay's UI layer) render that
 * one piece as a clickable "open in editor" link inline, before the
 * container is ever expanded, while `compactContainerPreview` below still
 * collapses every segment down to plain text for callers that just want a
 * string (log lines, tests, {@link summarizeNode} composition).
 */
export type CompactPreviewSegment = { readonly kind: "text"; readonly text: string } | { readonly kind: "component"; readonly node: PreviewComponentNode }

function textSegment(text: string): CompactPreviewSegment {
  return { kind: "text", text }
}

/** A node's own compact-preview segment: its real `summarizeNode` text, except a `component` node keeps its identity so the caller can render it specially. */
function segmentForNode(node: PreviewNode): CompactPreviewSegment {
  return node.kind === "component" ? { kind: "component", node } : textSegment(summarizeNode(node))
}

/** Joins each entry's own segment list with ", " separators and a trailing "…" once more was elided, mirroring `Array.prototype.join`'s comma-joining but at the segment level instead of the string level. */
function joinCompactSegments(entries: readonly (readonly CompactPreviewSegment[])[], hasMore: boolean): CompactPreviewSegment[] {
  if (entries.length === 0) return hasMore ? [textSegment("…")] : []
  const out: CompactPreviewSegment[] = []
  entries.forEach((segments, i) => {
    if (i > 0) out.push(textSegment(", "))
    out.push(...segments)
  })
  if (hasMore) out.push(textSegment(", …"))
  return out
}

/**
 * The segment-level form of {@link compactContainerPreview} (§7.4): the same
 * one-line, devtools-console-style shallow preview, but as an ordered list of
 * text/component pieces instead of one joined string, so a `component`-kind
 * direct child (e.g. `component: <HomePage>`) can be singled out and
 * rendered as a real clickable element instead of inert text. Nested
 * containers are still shown via their own `summarizeNode` type summary
 * (`Array(2)`, `User`, …), not recursed into — same one-level-deep
 * convention as the string form.
 *
 * A non-object's `TypeName(N)` count prefix (`Array(14)`, `Map(2)`, …) is
 * only included when {@link containerNeedsToggle} would show a "+" for this
 * same node: once every entry is already spelled out in full, the bracket
 * body itself conveys the count (and a bare `{ a => 1 }` vs `[ 1, 2 ]` is
 * already unambiguous between map/set/array), so the prefix would only
 * repeat information the toggle-less summary already shows in full.
 */
export function compactContainerSegments(node: ContainerNode): CompactPreviewSegment[] {
  const shownMore = (total: number, shown: number): boolean => node.truncated || total > shown
  const countPrefix = containerNeedsToggle(node) ? `${summarizeNode(node)} ` : ""
  switch (node.kind) {
    case "object": {
      const shown = node.entries.slice(0, COMPACT_PREVIEW_MAX_ENTRIES)
      const body = joinCompactSegments(
        shown.map((entry) => [textSegment(`${entry.key}: `), segmentForNode(entry.node)]),
        shownMore(node.entries.length, shown.length),
      )
      const prefix = node.className !== "Object" ? `${node.className} ` : ""
      return body.length === 0 ? [textSegment(`${prefix}{}`)] : [textSegment(`${prefix}{ `), ...body, textSegment(" }")]
    }
    case "array":
    case "typed-array": {
      const shown = node.items.slice(0, COMPACT_PREVIEW_MAX_ENTRIES)
      const body = joinCompactSegments(
        shown.map((item) => [segmentForNode(item)]),
        shownMore(node.items.length, shown.length),
      )
      return body.length === 0 ? [textSegment(`${countPrefix}[]`)] : [textSegment(`${countPrefix}[ `), ...body, textSegment(" ]")]
    }
    case "map": {
      const shown = node.entries.slice(0, COMPACT_PREVIEW_MAX_ENTRIES)
      const body = joinCompactSegments(
        shown.map((entry) => [segmentForNode(entry.key), textSegment(" => "), segmentForNode(entry.value)]),
        shownMore(node.entries.length, shown.length),
      )
      return body.length === 0 ? [textSegment(`${countPrefix}{}`)] : [textSegment(`${countPrefix}{ `), ...body, textSegment(" }")]
    }
    case "set": {
      const shown = node.items.slice(0, COMPACT_PREVIEW_MAX_ENTRIES)
      const body = joinCompactSegments(
        shown.map((item) => [segmentForNode(item)]),
        shownMore(node.items.length, shown.length),
      )
      return body.length === 0 ? [textSegment(`${countPrefix}{}`)] : [textSegment(`${countPrefix}{ `), ...body, textSegment(" }")]
    }
  }
}

/**
 * A one-line, devtools-console-style preview of a container's already-loaded
 * shallow contents (§7.4) — e.g. `{ id: 1, label: "Write the changelog",
 * done: false }` — built purely from data the initial `serialize()` already
 * returned, no `expandPreview` round-trip. Plain-text form of
 * {@link compactContainerSegments}, for callers that just want a string.
 */
export function compactContainerPreview(node: ContainerNode): string {
  return compactContainerSegments(node)
    .map((segment) => (segment.kind === "text" ? segment.text : summarizeNode(segment.node)))
    .join("")
}

/** A short one-line label for a node's own value (containers summarize their size, not their contents). */
export function summarizeNode(node: PreviewNode): string {
  switch (node.kind) {
    case "primitive":
      switch (node.type) {
        case "string":
          return JSON.stringify(node.value)
        case "null":
          return "null"
        case "undefined":
          return "undefined"
        default:
          return String(node.value)
      }
    case "bigint":
      return `${node.value}n`
    case "symbol":
      return node.description === null ? "Symbol()" : `Symbol(${node.description})`
    case "function":
      return node.name.length > 0 ? `ƒ ${node.name}()` : "ƒ ()"
    case "component":
      return `<${node.name}>`
    case "dom-node":
      if (node.tagName !== null) return `<${node.tagName}>`
      return node.nodeType === 3 ? "#text" : "#node"
    case "error":
      return `${node.name}: ${node.message}`
    case "promise":
      return "Promise"
    case "array":
      return `Array(${node.length})`
    case "object":
      return node.className
    case "map":
      return `Map(${node.size})`
    case "set":
      return `Set(${node.size})`
    case "typed-array":
      return `${node.typeName}(${node.length})`
    case "getter":
      return "(...)"
    case "circular":
      return "[Circular]"
    case "redacted":
      return node.replacement
    case "max-depth":
      return "…"
  }
}
