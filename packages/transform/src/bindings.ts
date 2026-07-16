import type * as t from "@babel/types"

const importedName = (specifier: t.ImportSpecifier): string =>
  specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value

/** `const m = require("mithril")` (§6.4). */
const requireSource = (init: t.Expression | null | undefined): string | null => {
  if (init?.type !== "CallExpression") return null
  if (init.callee.type !== "Identifier" || init.callee.name !== "require") return null
  const [argument] = init.arguments
  return argument?.type === "StringLiteral" ? argument.value : null
}

/**
 * Local binding names confirmed to hold a Mithril hyperscript factory (§6.4):
 * default imports (any local name), `{ default as x }`, top-level `require()`
 * bindings, and named imports whose *imported* name is listed in
 * `hyperscriptIdentifiers`. Only calls through these names are transformed.
 */
export const findMithrilBindings = (
  program: t.Program,
  mithrilImports: readonly string[],
  hyperscriptIdentifiers: readonly string[],
): ReadonlySet<string> => {
  const bindings = new Set<string>()
  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") {
      if (!mithrilImports.includes(statement.source.value)) continue
      for (const specifier of statement.specifiers) {
        if (specifier.type === "ImportDefaultSpecifier") {
          bindings.add(specifier.local.name)
        } else if (specifier.type === "ImportSpecifier") {
          const imported = importedName(specifier)
          if (imported === "default" || hyperscriptIdentifiers.includes(imported)) {
            bindings.add(specifier.local.name)
          }
        }
      }
    } else if (statement.type === "VariableDeclaration") {
      for (const declarator of statement.declarations) {
        if (declarator.id.type !== "Identifier") continue
        const source = requireSource(declarator.init)
        if (source !== null && mithrilImports.includes(source)) {
          bindings.add(declarator.id.name)
        }
      }
    }
  }
  return bindings
}
