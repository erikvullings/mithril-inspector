import type { PreviewNode, PreviewPath } from "@mithril-inspector/protocol"

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

/**
 * Whether a container's own fields are simple enough that rendering them
 * expanded — flat key/value pairs, no braces, no toggle button — is strictly
 * more compact than the "+ { ... }" collapsed summary it would otherwise
 * replace. Restricted to plain objects with only primitive-leaf fields: an
 * object's compact preview already spells out every key (`{ id: 1, ... }`),
 * so dropping the braces/button on expansion only removes text. An
 * array/map/set's compact preview omits its index/key labels, so expanding
 * one adds text (`0: 1, 1: 2, …`) rather than removing it — those keep the
 * regular click-to-expand toggle.
 */
export function fitsExpandedInline(node: ContainerNode): boolean {
  if (node.truncated || node.kind !== "object" || node.className !== "Object") return false
  return node.entries.every((entry) => !isContainerNode(entry.node) && !isExpandable(entry.node))
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

function joinCompact(parts: readonly string[], hasMore: boolean): string {
  if (parts.length === 0) return hasMore ? "…" : ""
  return hasMore ? `${parts.join(", ")}, …` : parts.join(", ")
}

/**
 * A one-line, devtools-console-style preview of a container's already-loaded
 * shallow contents (§7.4) — e.g. `{ id: 1, label: "Write the changelog",
 * done: false }` — built purely from data the initial `serialize()` already
 * returned, no `expandPreview` round-trip. Nested containers within it are
 * shown via their own `summarizeNode` type summary (`Array(2)`, `User`, …),
 * not recursed into, matching the one-level-deep convention of a devtools
 * console object preview.
 */
export function compactContainerPreview(node: ContainerNode): string {
  const shownMore = (total: number, shown: number): boolean => node.truncated || total > shown
  switch (node.kind) {
    case "object": {
      const shown = node.entries.slice(0, COMPACT_PREVIEW_MAX_ENTRIES)
      const body = joinCompact(
        shown.map((entry) => `${entry.key}: ${summarizeNode(entry.node)}`),
        shownMore(node.entries.length, shown.length),
      )
      const prefix = node.className !== "Object" ? `${node.className} ` : ""
      return body === "" ? `${prefix}{}` : `${prefix}{ ${body} }`
    }
    case "array":
    case "typed-array": {
      const shown = node.items.slice(0, COMPACT_PREVIEW_MAX_ENTRIES)
      const body = joinCompact(shown.map((item) => summarizeNode(item)), shownMore(node.items.length, shown.length))
      const prefix = `${summarizeNode(node)} `
      return body === "" ? `${prefix}[]` : `${prefix}[ ${body} ]`
    }
    case "map": {
      const shown = node.entries.slice(0, COMPACT_PREVIEW_MAX_ENTRIES)
      const body = joinCompact(
        shown.map((entry) => `${summarizeNode(entry.key)} => ${summarizeNode(entry.value)}`),
        shownMore(node.entries.length, shown.length),
      )
      return body === "" ? `${summarizeNode(node)} {}` : `${summarizeNode(node)} { ${body} }`
    }
    case "set": {
      const shown = node.items.slice(0, COMPACT_PREVIEW_MAX_ENTRIES)
      const body = joinCompact(shown.map((item) => summarizeNode(item)), shownMore(node.items.length, shown.length))
      return body === "" ? `${summarizeNode(node)} {}` : `${summarizeNode(node)} { ${body} }`
    }
  }
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
