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
