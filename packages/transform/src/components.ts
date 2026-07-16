import type * as t from "@babel/types"

import { eachChild } from "./ast.js"

/** Strips TS-only wrappers so `{ view } as Component` still detects (§6.5). */
export const unwrapExpression = (node: t.Node): t.Node => {
  let current = node
  while (
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "ParenthesizedExpression"
  ) {
    current = current.expression
  }
  return current
}

const isViewKey = (key: t.Node, computed: boolean): boolean =>
  !computed &&
  ((key.type === "Identifier" && key.name === "view") ||
    (key.type === "StringLiteral" && key.value === "view"))

const isFunctionValued = (node: t.Node): boolean => {
  const value = unwrapExpression(node)
  return value.type === "FunctionExpression" || value.type === "ArrowFunctionExpression"
}

/** The `view` member of an object component, or null (§6.5 object form). */
export const objectComponentView = (node: t.Node): t.ObjectMethod | t.ObjectProperty | null => {
  if (node.type !== "ObjectExpression") return null
  for (const property of node.properties) {
    if (property.type === "ObjectMethod" && property.kind === "method") {
      if (isViewKey(property.key, property.computed)) return property
    } else if (property.type === "ObjectProperty") {
      if (isViewKey(property.key, property.computed) && isFunctionValued(property.value)) {
        return property
      }
    }
  }
  return null
}

type AnyFunction = t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression

const isAnyFunction = (node: t.Node): node is AnyFunction =>
  node.type === "FunctionDeclaration" ||
  node.type === "FunctionExpression" ||
  node.type === "ArrowFunctionExpression"

/** Return statements belonging to `body` itself, not to nested functions. */
const ownReturnArguments = (node: t.Node, out: t.Node[]): void => {
  if (isAnyFunction(node) || node.type === "ObjectMethod" || node.type === "ClassMethod") return
  if (node.type === "ReturnStatement") {
    if (node.argument != null) out.push(node.argument)
    return
  }
  eachChild(node, (child) => ownReturnArguments(child, out))
}

/**
 * The `view` member of the object a closure component returns, or null
 * (§6.5 closure form). Checks the concise arrow body and every return
 * statement of the function's own body.
 */
export const closureComponentView = (node: t.Node): t.ObjectMethod | t.ObjectProperty | null => {
  if (!isAnyFunction(node)) return null
  if (node.body.type !== "BlockStatement") {
    return objectComponentView(unwrapExpression(node.body))
  }
  const returns: t.Node[] = []
  for (const statement of node.body.body) ownReturnArguments(statement, returns)
  for (const argument of returns) {
    const view = objectComponentView(unwrapExpression(argument))
    if (view !== null) return view
  }
  return null
}

/** The `view` method of a class component, or null (§6.5 class form). */
export const classComponentView = (node: t.Node): t.ClassMethod | null => {
  if (node.type !== "ClassDeclaration" && node.type !== "ClassExpression") return null
  for (const member of node.body.body) {
    if (
      member.type === "ClassMethod" &&
      member.kind === "method" &&
      !member.static &&
      isViewKey(member.key, member.computed)
    ) {
      return member
    }
  }
  return null
}

/**
 * Detects any §6.5 component expression and returns its view node, or null.
 */
export const componentView = (
  node: t.Node,
): t.ObjectMethod | t.ObjectProperty | t.ClassMethod | null =>
  objectComponentView(node) ?? closureComponentView(node) ?? classComponentView(node)
