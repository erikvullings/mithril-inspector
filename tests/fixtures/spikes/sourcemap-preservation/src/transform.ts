import { parse } from "@babel/parser"
import type * as t from "@babel/types"
import MagicString from "magic-string"
import type { SourceMap } from "magic-string"

export interface SourceMarker {
  sourceId: string
  /** 1-based line of the wrapped expression in the original module (§6.3). */
  line: number
  /** 1-based column of the wrapped expression in the original module (§6.3). */
  column: number
}

export interface SpikeTransformOptions {
  id: string
  code: string
  jsx?: boolean
}

export interface SpikeTransformResult {
  code: string
  map: SourceMap
  markers: SourceMarker[]
}

const RUNTIME_IMPORT =
  'import { source as __miSource } from "virtual:mithril-inspector/runtime"\n'

const isNode = (value: unknown): value is t.Node =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string"

/** Pre-order walk over a Babel AST without pulling in @babel/traverse. */
const visit = (
  node: t.Node,
  callback: (node: t.Node, parent: t.Node | null) => void,
  parent: t.Node | null = null,
): void => {
  callback(node, parent)
  for (const key of Object.keys(node)) {
    if (key === "loc") continue
    const value = (node as unknown as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) visit(item, callback, node)
      }
    } else if (isNode(value)) {
      visit(value, callback, node)
    }
  }
}

/** Local name bound to mithril's default export, or null if not imported (§6.4). */
const findMithrilDefaultBinding = (program: t.Program): string | null => {
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue
    if (statement.source.value !== "mithril") continue
    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportDefaultSpecifier") return specifier.local.name
      if (
        specifier.type === "ImportSpecifier" &&
        specifier.imported.type === "Identifier" &&
        specifier.imported.name === "default"
      ) {
        return specifier.local.name
      }
    }
  }
  return null
}

/**
 * Prototype of the inspector transform: wraps every `m(...)` call belonging to
 * the module's mithril binding in `__miSource("<id>", ...)` using MagicString,
 * so the original text is never re-printed and the returned high-resolution
 * source map stays surgical.
 */
export function transformMithrilModule(
  options: SpikeTransformOptions,
): SpikeTransformResult | null {
  const { id, code, jsx = false } = options
  const ast = parse(code, {
    sourceType: "module",
    plugins: jsx ? ["typescript", "jsx"] : ["typescript"],
  })

  const mithrilBinding = findMithrilDefaultBinding(ast.program)
  if (mithrilBinding === null) return null

  const ms = new MagicString(code)
  const markers: SourceMarker[] = []

  const wrap = (node: t.Node): void => {
    if (node.start == null || node.end == null || node.loc == null) return
    const sourceId = `s${markers.length + 1}`
    markers.push({
      sourceId,
      line: node.loc.start.line,
      column: node.loc.start.column + 1,
    })
    ms.appendLeft(node.start, `__miSource("${sourceId}", `)
    ms.appendRight(node.end, ")")
  }

  visit(ast.program, (node, parent) => {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === mithrilBinding
    ) {
      wrap(node)
      return
    }
    // JSX support is experimental and limited to expression-position roots:
    // a call wrapper is not valid syntax in JSX-child position (§6.6).
    if (
      jsx &&
      node.type === "JSXElement" &&
      parent?.type !== "JSXElement" &&
      parent?.type !== "JSXFragment"
    ) {
      wrap(node)
    }
  })

  if (markers.length === 0) return null
  ms.prepend(RUNTIME_IMPORT)

  return {
    code: ms.toString(),
    map: ms.generateMap({ source: id, hires: true, includeContent: true }),
    markers,
  }
}
