import type * as t from "@babel/types"

const SKIPPED_KEYS = new Set(["loc", "leadingComments", "trailingComments", "innerComments", "extra"])

export const isNode = (value: unknown): value is t.Node =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string"

/** Invokes `callback` for every direct AST child of `node` (ADR-102: no @babel/traverse). */
export const eachChild = (node: t.Node, callback: (child: t.Node) => void): void => {
  for (const key of Object.keys(node)) {
    if (SKIPPED_KEYS.has(key)) continue
    const value = (node as unknown as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) callback(item)
      }
    } else if (isNode(value)) {
      callback(value)
    }
  }
}

export const hasSpan = (
  node: t.Node,
): node is t.Node & { start: number; end: number; loc: t.SourceLocation } =>
  node.start != null && node.end != null && node.loc != null
