import type * as t from "@babel/types"

import { eachChild, hasSpan } from "./ast.js"
import { componentView, objectComponentView, unwrapExpression } from "./components.js"
import type { SourceKind } from "./types.js"

/** How a planned marker edits the module, if at all. */
export type PlannedEdit =
  /** Wrap the expression at [start, end) in a helper call. */
  | { readonly type: "wrap"; readonly start: number; readonly end: number; readonly helper: "__miSource" | "__miComponent" }
  /** Insert `__miComponent("<id>", <reference>);` after offset `at` (class/function declarations). */
  | { readonly type: "insert-after"; readonly at: number; readonly reference: string }

/** One planned marker: where it points and how the code gets edited. */
export interface PlannedMarker {
  readonly kind: SourceKind
  readonly line: number
  readonly column: number
  readonly endLine: number
  readonly endColumn: number
  readonly tagName?: string
  readonly displayName?: string
  /** null for registration-only markers (e.g. component views). */
  readonly edit: PlannedEdit | null
}

type FunctionLike =
  | t.FunctionDeclaration
  | t.FunctionExpression
  | t.ArrowFunctionExpression
  | t.ObjectMethod
  | t.ClassMethod
  | t.ClassPrivateMethod

const FUNCTION_LIKE_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ObjectMethod",
  "ClassMethod",
  "ClassPrivateMethod",
])

const isFunctionLike = (node: t.Node): node is FunctionLike => FUNCTION_LIKE_TYPES.has(node.type)

/** Collects every name bound by a binding pattern (params, declarators). */
const patternNames = (pattern: t.Node, out: Set<string>): void => {
  switch (pattern.type) {
    case "Identifier":
      out.add(pattern.name)
      break
    case "ObjectPattern":
      for (const property of pattern.properties) {
        patternNames(property.type === "ObjectProperty" ? property.value : property.argument, out)
      }
      break
    case "ArrayPattern":
      for (const element of pattern.elements) {
        if (element !== null) patternNames(element, out)
      }
      break
    case "AssignmentPattern":
      patternNames(pattern.left, out)
      break
    case "RestElement":
      patternNames(pattern.argument, out)
      break
    default:
      break
  }
}

/**
 * Names declared anywhere inside a function body without crossing into nested
 * functions. Deliberately function-granular rather than block-granular: a
 * block-scoped redeclaration shadows the whole enclosing function, which can
 * only skip instrumentation, never mis-attribute it.
 */
const collectBodyDeclarations = (node: t.Node, out: Set<string>): void => {
  if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
    if (node.id != null) out.add(node.id.name)
    return
  }
  if (isFunctionLike(node)) return
  if (node.type === "VariableDeclarator") patternNames(node.id, out)
  if (node.type === "CatchClause" && node.param != null) patternNames(node.param, out)
  eachChild(node, (child) => collectBodyDeclarations(child, out))
}

const functionScopeNames = (fn: FunctionLike): ReadonlySet<string> => {
  const names = new Set<string>()
  if ((fn.type === "FunctionDeclaration" || fn.type === "FunctionExpression") && fn.id != null) {
    names.add(fn.id.name)
  }
  for (const param of fn.params) patternNames(param, names)
  if (fn.body.type === "BlockStatement") {
    eachChild(fn.body, (child) => collectBodyDeclarations(child, names))
  }
  return names
}

/** Tag name from a hyperscript CSS selector; Mithril defaults to `div` (§6.3). */
const tagFromSelector = (selector: string): string => {
  const match = /^[A-Za-z][\w:-]*/.exec(selector)
  return match ? match[0] : "div"
}

/**
 * Mithril's vnode-producing methods and the internal tag each produces:
 * `m.fragment(...)` → `"["`, `m.trust(...)` → `"<"`. Other `m.*` members
 * (mount, route, request, …) are not vnode factories and stay untouched.
 */
const FACTORY_METHOD_TAGS: Readonly<Record<string, string>> = {
  fragment: "[",
  trust: "<",
}

/** The internal tag when `callee` is `<binding>.fragment` / `<binding>.trust`. */
const factoryMethodTag = (
  callee: t.Node,
  isHyperscriptName: (name: string) => boolean,
): string | undefined => {
  if (callee.type !== "MemberExpression" || callee.computed) return undefined
  if (callee.object.type !== "Identifier" || !isHyperscriptName(callee.object.name)) return undefined
  if (callee.property.type !== "Identifier") return undefined
  return FACTORY_METHOD_TAGS[callee.property.name]
}

/**
 * Walks a parsed module and plans every marker and code edit for calls made
 * through the confirmed hyperscript bindings (§6.1) and for every detected
 * component form (§6.5). Markers are numbered in document order, so output
 * is deterministic.
 */
export const planMarkers = (
  program: t.Program,
  code: string,
  bindings: ReadonlySet<string>,
): PlannedMarker[] => {
  const markers: PlannedMarker[] = []
  const scopes: Array<ReadonlySet<string>> = []

  const isShadowed = (name: string): boolean => scopes.some((scope) => scope.has(name))

  const pushMarker = (
    kind: SourceKind,
    node: t.Node & { loc: t.SourceLocation },
    edit: PlannedEdit | null,
    names: { tagName?: string; displayName?: string } = {},
  ): void => {
    markers.push({
      kind,
      line: node.loc.start.line,
      column: node.loc.start.column + 1,
      endLine: node.loc.end.line,
      endColumn: node.loc.end.column + 1,
      ...(names.tagName === undefined ? {} : { tagName: names.tagName }),
      ...(names.displayName === undefined ? {} : { displayName: names.displayName }),
      edit,
    })
  }

  /** Declaration + view markers for one detected component (§6.5). */
  const addComponent = (
    displayName: string | undefined,
    declarationNode: t.Node,
    view: t.Node,
    edit: PlannedEdit | null,
  ): void => {
    if (!hasSpan(declarationNode)) return
    pushMarker("component-declaration", declarationNode, edit, {
      ...(displayName === undefined ? {} : { displayName }),
    })
    if (hasSpan(view)) {
      pushMarker("component-view", view, null, {
        ...(displayName === undefined ? {} : { displayName }),
      })
    }
  }

  /** `const Name = <component-expression>` (object, closure, class forms). */
  const visitDeclarator = (node: t.VariableDeclarator): void => {
    if (node.id.type !== "Identifier" || node.init == null || !hasSpan(node.init)) return
    const view = componentView(unwrapExpression(node.init))
    if (view === null) return
    addComponent(node.id.name, node.init, view, {
      type: "wrap",
      start: node.init.start,
      end: node.init.end,
      helper: "__miComponent",
    })
  }

  /** `export default <component-expression>` (anonymous components). */
  const visitDefaultExport = (node: t.ExportDefaultDeclaration): void => {
    const declaration = node.declaration
    if (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") {
      return // handled as declarations below
    }
    if (!hasSpan(declaration)) return
    const view = componentView(unwrapExpression(declaration))
    if (view === null) return
    addComponent(undefined, declaration, view, {
      type: "wrap",
      start: declaration.start,
      end: declaration.end,
      helper: "__miComponent",
    })
  }

  /**
   * Expression-position JSX root (§6.6, experimental). A call wrapper is not
   * valid syntax in JSX-child position, so children inherit their root's
   * mapping; roots inside expression containers are wrapped normally.
   */
  const visitJsxRoot = (
    node: (t.JSXElement | t.JSXFragment) & { start: number; end: number; loc: t.SourceLocation },
  ): void => {
    const names: { tagName?: string; displayName?: string } = {}
    if (node.type === "JSXFragment") {
      names.tagName = "["
    } else {
      const name = node.openingElement.name
      if (name.type === "JSXIdentifier") {
        if (/^[a-z]/.test(name.name)) names.tagName = name.name
        else names.displayName = name.name
      } else if (name.type === "JSXNamespacedName") {
        names.tagName = `${name.namespace.name}:${name.name.name}`
      } else if (hasSpan(name)) {
        names.displayName = code.slice(name.start, name.end)
      }
    }
    pushMarker("element", node, { type: "wrap", start: node.start, end: node.end, helper: "__miSource" }, names)
  }

  /** `function Name() { return { view } }` / `class Name { view() {} }`. */
  const visitDeclaration = (node: t.FunctionDeclaration | t.ClassDeclaration): void => {
    const view = componentView(node)
    if (view === null || !hasSpan(node)) return
    const name = node.id?.name
    addComponent(
      name,
      node,
      view,
      name === undefined ? null : { type: "insert-after", at: node.end, reference: name },
    )
  }

  const visitHyperscriptCall = (
    node: t.CallExpression & { start: number; end: number; loc: t.SourceLocation },
  ): void => {
    const [first] = node.arguments
    const names: { tagName?: string; displayName?: string } = {}
    if (first !== undefined) {
      if (first.type === "StringLiteral") {
        names.tagName = tagFromSelector(first.value)
      } else if (first.type === "TemplateLiteral" && first.expressions.length === 0) {
        names.tagName = tagFromSelector(first.quasis[0]?.value.cooked ?? "")
      } else if (first.type === "Identifier") {
        names.displayName = first.name
      } else if (first.type === "MemberExpression" && hasSpan(first)) {
        names.displayName = code.slice(first.start, first.end)
      }
    }
    pushMarker("element", node, { type: "wrap", start: node.start, end: node.end, helper: "__miSource" }, names)

    // Inline anonymous component: m({ view: ... }) (§6.5).
    if (first !== undefined && hasSpan(first)) {
      const inner = unwrapExpression(first)
      const view = objectComponentView(inner)
      if (view !== null) {
        addComponent(undefined, first, view, {
          type: "wrap",
          start: first.start,
          end: first.end,
          helper: "__miComponent",
        })
      }
    }
  }

  const walk = (node: t.Node, parent: t.Node | null): void => {
    if (node.type === "VariableDeclarator") {
      visitDeclarator(node)
    } else if (node.type === "ExportDefaultDeclaration") {
      visitDefaultExport(node)
    } else if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
      visitDeclaration(node)
    }

    if (isFunctionLike(node)) {
      scopes.push(functionScopeNames(node))
      eachChild(node, (child) => walk(child, node))
      scopes.pop()
      return
    }

    if (node.type === "CallExpression" && hasSpan(node)) {
      const isHyperscriptName = (name: string): boolean =>
        bindings.has(name) && !isShadowed(name)
      if (node.callee.type === "Identifier" && isHyperscriptName(node.callee.name)) {
        visitHyperscriptCall(node)
      } else {
        const tagName = factoryMethodTag(node.callee, isHyperscriptName)
        if (tagName !== undefined) {
          pushMarker(
            "element",
            node,
            { type: "wrap", start: node.start, end: node.end, helper: "__miSource" },
            { tagName },
          )
        }
      }
    }

    if (
      (node.type === "JSXElement" || node.type === "JSXFragment") &&
      parent?.type !== "JSXElement" &&
      parent?.type !== "JSXFragment" &&
      hasSpan(node)
    ) {
      visitJsxRoot(node)
    }

    eachChild(node, (child) => walk(child, node))
  }

  eachChild(program, (child) => walk(child, program))
  return markers
}
