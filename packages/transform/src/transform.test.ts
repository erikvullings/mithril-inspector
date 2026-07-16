import { describe, expect, it } from "vitest"

import { clearTransformCache, transformMithrilModule } from "./transform.js"

const USER_CARD = `import m from "mithril"

export const UserCard = {
  view: ({ attrs }) =>
    m("article.user-card", [
      m("h2", attrs.name),
      m("button", { onclick: attrs.onEdit }, "Edit"),
    ]),
}
`

describe("transformMithrilModule", () => {
  it("wraps hyperscript calls of the default mithril import and registers the module", () => {
    const result = transformMithrilModule({
      id: "/project/src/UserCard.ts",
      code: USER_CARD,
      root: "/project",
    })

    expect(result).not.toBeNull()
    const { code, metadata } = result!

    // Every m(...) element call is wrapped in a qualified source marker.
    expect(code).toContain(`__miSource("${metadata.id}:`)
    expect(code).toMatch(/__miSource\("m:[^"]+:s\d+", m\("article\.user-card"/)
    expect(code).toMatch(/__miSource\("m:[^"]+:s\d+", m\("h2"/)
    expect(code).toMatch(/__miSource\("m:[^"]+:s\d+", m\("button"/)

    // The runtime import and the module registration are prepended.
    expect(code).toContain("__miRegisterModule(")
    expect(code).toContain(`import { registerModule as __miRegisterModule`)

    // Element markers carry 1-based positions and parsed tag names.
    const elements = Object.values(metadata.sources).filter((s) => s.kind === "element")
    expect(elements.map((s) => s.tagName)).toEqual(["article", "h2", "button"])
    const article = elements[0]!
    expect(article.line).toBe(5)
    expect(article.column).toBe(5)
    expect(article.relativeFile).toBe("src/UserCard.ts")
    expect(article.absoluteFile).toBe("/project/src/UserCard.ts")
  })

  describe("import detection (§6.4)", () => {
    it("returns null for files without any Mithril import", () => {
      const result = transformMithrilModule({
        id: "/project/src/util.ts",
        code: `export const add = (a: number, b: number) => a + b\n`,
      })
      expect(result).toBeNull()
    })

    it("does not transform an unrelated local function named m", () => {
      const result = transformMithrilModule({
        id: "/project/src/math.ts",
        code: `const m = (a: number) => a * 2\nexport const double = m(21)\n`,
      })
      expect(result).toBeNull()
    })

    it("follows a renamed default import", () => {
      const result = transformMithrilModule({
        id: "/project/src/App.ts",
        code: `import Mithril from "mithril"\nexport const App = { view: () => Mithril("main") }\n`,
      })
      expect(result?.code).toMatch(/__miSource\("m:[^"]+:s\d+", Mithril\("main"\)\)/)
    })

    it('follows an `import { default as h }` binding', () => {
      const result = transformMithrilModule({
        id: "/project/src/App.ts",
        code: `import { default as h } from "mithril"\nexport const App = { view: () => h("main") }\n`,
      })
      expect(result?.code).toMatch(/__miSource\("m:[^"]+:s\d+", h\("main"\)\)/)
    })

    it("follows a require() binding", () => {
      const result = transformMithrilModule({
        id: "/project/src/app.js",
        code: `const m = require("mithril")\nmodule.exports = { view: () => m("main") }\n`,
      })
      expect(result?.code).toMatch(/__miSource\("m:[^"]+:s\d+", m\("main"\)\)/)
    })

    it("honors the mithrilImports option for wrapper modules", () => {
      const code = `import m from "@app/mithril"\nexport const App = { view: () => m("main") }\n`
      expect(transformMithrilModule({ id: "/p/a.ts", code })).toBeNull()
      const result = transformMithrilModule({
        id: "/p/a.ts",
        code,
        mithrilImports: ["mithril", "@app/mithril"],
      })
      expect(result?.code).toContain('__miSource("')
    })

    it("honors hyperscriptIdentifiers for named factory imports", () => {
      const code = `import { h } from "@app/mithril"\nexport const App = { view: () => h("main") }\n`
      expect(
        transformMithrilModule({ id: "/p/a.ts", code, mithrilImports: ["@app/mithril"] }),
      ).toBeNull()
      const result = transformMithrilModule({
        id: "/p/a.ts",
        code,
        mithrilImports: ["@app/mithril"],
        hyperscriptIdentifiers: ["m", "h"],
      })
      expect(result?.code).toMatch(/__miSource\("m:[^"]+:s\d+", h\("main"\)\)/)
    })

    it("matches hyperscriptIdentifiers against the imported name, not the alias", () => {
      const result = transformMithrilModule({
        id: "/p/a.ts",
        code: `import { m as hs } from "@app/mithril"\nexport const App = { view: () => hs("main") }\n`,
        mithrilImports: ["@app/mithril"],
      })
      expect(result?.code).toMatch(/__miSource\("m:[^"]+:s\d+", hs\("main"\)\)/)
    })

    it("does not transform calls through a shadowing parameter or local", () => {
      const result = transformMithrilModule({
        id: "/p/shadow.ts",
        code: [
          `import m from "mithril"`,
          `const viaParam = (m: (s: string) => number) => m("not-mithril")`,
          `const viaLocal = () => {`,
          `  const m = (s: string) => s.length`,
          `  return m("also-not-mithril")`,
          `}`,
          `export const App = { view: () => m("main", viaParam(String.length ? (s) => 1 : (s) => 2), viaLocal()) }`,
          ``,
        ].join("\n"),
      })
      expect(result).not.toBeNull()
      const { code, metadata } = result!
      expect(code).not.toMatch(/__miSource\("[^"]+", m\("not-mithril"/)
      expect(code).toMatch(/return m\("also-not-mithril"\)/)
      expect(code).toMatch(/__miSource\("m:[^"]+:s\d+", m\("main"/)
      const elements = Object.values(metadata.sources).filter((s) => s.kind === "element")
      expect(elements).toHaveLength(1)
    })

    it("does not treat named imports outside hyperscriptIdentifiers as factories", () => {
      const result = transformMithrilModule({
        id: "/p/a.ts",
        code: `import { trust } from "mithril"\nexport const html = trust("<b>hi</b>")\n`,
      })
      expect(result).toBeNull()
    })
  })

  describe("component detection (§6.5)", () => {
    const kindsOf = (result: ReturnType<typeof transformMithrilModule>) =>
      Object.values(result!.metadata.sources).map((s) => `${s.kind}${s.displayName ? `:${s.displayName}` : ""}`)

    it("wraps an object component declaration in __miComponent", () => {
      const result = transformMithrilModule({
        id: "/p/UserCard.ts",
        code: USER_CARD,
        root: "/p",
      })
      expect(result?.code).toMatch(/export const UserCard = __miComponent\("m:[^"]+:s\d+", \{/)
      expect(kindsOf(result)).toContain("component-declaration:UserCard")
      expect(kindsOf(result)).toContain("component-view:UserCard")
    })

    it("wraps a closure component and marks the view inside the returned object", () => {
      const result = transformMithrilModule({
        id: "/p/Counter.ts",
        code: [
          `import m from "mithril"`,
          `export const Counter = () => {`,
          `  let count = 0`,
          `  return {`,
          `    view() {`,
          `      return m("button", { onclick: () => count++ }, count)`,
          `    },`,
          `  }`,
          `}`,
          ``,
        ].join("\n"),
      })
      expect(result?.code).toMatch(/export const Counter = __miComponent\("m:[^"]+:s\d+", \(\) => \{/)
      expect(kindsOf(result)).toContain("component-declaration:Counter")
      expect(kindsOf(result)).toContain("component-view:Counter")
      const view = Object.values(result!.metadata.sources).find((s) => s.kind === "component-view")!
      expect(view.line).toBe(5)
    })

    it("registers a class component declaration after its statement", () => {
      const result = transformMithrilModule({
        id: "/p/Widget.ts",
        code: [
          `import m from "mithril"`,
          `export class Widget {`,
          `  view() {`,
          `    return m("div.widget")`,
          `  }`,
          `}`,
          ``,
        ].join("\n"),
      })
      expect(result?.code).toMatch(/^\}\n__miComponent\("m:[^"]+:s\d+", Widget\);$/m)
      expect(kindsOf(result)).toContain("component-declaration:Widget")
      expect(kindsOf(result)).toContain("component-view:Widget")
    })

    it("wraps an inline anonymous component passed to m()", () => {
      const result = transformMithrilModule({
        id: "/p/inline.ts",
        code: `import m from "mithril"\nexport const vnode = m({ view: () => m("div") })\n`,
      })
      const code = result!.code
      expect(code).toMatch(/__miSource\("m:[^"]+:s\d+", m\(__miComponent\("m:[^"]+:s\d+", \{ view:/)
      expect(kindsOf(result)).toContain("component-declaration")
      expect(kindsOf(result)).toContain("component-view")
    })

    it("marks imported-component usage locations with the component's name", () => {
      const result = transformMithrilModule({
        id: "/p/page.ts",
        code: `import m from "mithril"\nimport { UserCard } from "./UserCard.js"\nexport const Page = { view: () => m(UserCard, { name: "Ada" }) }\n`,
      })
      const usage = Object.values(result!.metadata.sources).find(
        (s) => s.kind === "element" && s.displayName === "UserCard",
      )
      expect(usage).toBeDefined()
      expect(usage!.tagName).toBeUndefined()
    })

    it("wraps an anonymous default-export object component without a display name", () => {
      const result = transformMithrilModule({
        id: "/p/anon.ts",
        code: `import m from "mithril"\nexport default {\n  view: () => m("p", "hi"),\n}\n`,
      })
      expect(result?.code).toMatch(/export default __miComponent\("m:[^"]+:s\d+", \{/)
      const declaration = Object.values(result!.metadata.sources).find(
        (s) => s.kind === "component-declaration",
      )!
      expect(declaration.displayName).toBeUndefined()
    })

    it("registers a function-declaration closure component after its statement", () => {
      const result = transformMithrilModule({
        id: "/p/factory.ts",
        code: [
          `import m from "mithril"`,
          `export function Stepper() {`,
          `  return { view: () => m("input[type=number]") }`,
          `}`,
          ``,
        ].join("\n"),
      })
      expect(result?.code).toMatch(/^\}\n__miComponent\("m:[^"]+:s\d+", Stepper\);$/m)
      expect(kindsOf(result)).toContain("component-declaration:Stepper")
    })
  })

  describe("vnode factories and structures (§19.1)", () => {
    it("instruments m.fragment and m.trust but no other m.* calls", () => {
      const result = transformMithrilModule({
        id: "/p/frag.ts",
        code: [
          `import m from "mithril"`,
          `export const App = {`,
          `  view: () =>`,
          `    m.fragment({ key: 1 }, [`,
          `      m("p", "one"),`,
          `      m.trust("<b>two</b>"),`,
          `    ]),`,
          `}`,
          `m.mount(document.body, App)`,
          ``,
        ].join("\n"),
      })
      const { code, metadata } = result!
      expect(code).toMatch(/__miSource\("m:[^"]+:s\d+", m\.fragment\(/)
      expect(code).toMatch(/__miSource\("m:[^"]+:s\d+", m\.trust\(/)
      expect(code).toMatch(/^m\.mount\(document\.body, App\)$/m)
      const tags = Object.values(metadata.sources)
        .filter((s) => s.kind === "element")
        .map((s) => s.tagName)
      expect(tags).toEqual(["[", "p", "<"])
    })

    it("instruments nested same-line calls, arrays and keyed lists distinctly", () => {
      const result = transformMithrilModule({
        id: "/p/list.ts",
        code: [
          `import m from "mithril"`,
          `const items = ["a", "b"]`,
          `export const List = {`,
          `  view: () => m("ul", items.map((item) => m("li", { key: item }, [m("em", item), m("code", item)]))),`,
          `}`,
          ``,
        ].join("\n"),
      })
      const elements = Object.values(result!.metadata.sources).filter((s) => s.kind === "element")
      expect(elements.map((s) => s.tagName)).toEqual(["ul", "li", "em", "code"])
      // Same-line siblings must keep distinct 1-based columns.
      const columns = elements.map((s) => s.column)
      expect(new Set(columns).size).toBe(columns.length)
      expect(elements.every((s) => s.line === 4)).toBe(true)
    })
  })

  describe("JSX and TSX (§6.6, experimental)", () => {
    const HELLO_TSX = [
      `/** @jsx m */`,
      `import m from "mithril"`,
      `import { UserCard } from "./UserCard.js"`,
      ``,
      `export const View = () => (`,
      `  <section class="hero">`,
      `    <h1>Hello</h1>`,
      `    {<em>expression child</em>}`,
      `    <UserCard name="Ada" />`,
      `  </section>`,
      `)`,
      ``,
    ].join("\n")

    it("wraps expression-position JSX roots in a .tsx module", () => {
      const result = transformMithrilModule({ id: "/p/hello.tsx", code: HELLO_TSX })
      expect(result).not.toBeNull()
      expect(result!.code).toMatch(/__miSource\("m:[^"]+:s\d+", <section class="hero">/)
      const section = Object.values(result!.metadata.sources).find((s) => s.tagName === "section")!
      expect(section.line).toBe(6)
      expect(section.column).toBe(3)
    })

    it("does not wrap JSX children directly, but does wrap expression-container roots", () => {
      const result = transformMithrilModule({ id: "/p/hello.tsx", code: HELLO_TSX })
      const { code, metadata } = result!
      // <h1> is in child position: a call wrapper would be invalid syntax there.
      expect(code).not.toMatch(/__miSource\("[^"]*", <h1>/)
      expect(code).toMatch(/\{__miSource\("m:[^"]+:s\d+", <em>expression child<\/em>\)\}/)
      const tags = Object.values(metadata.sources).map((s) => s.tagName)
      expect(tags).not.toContain("h1")
      expect(tags).toContain("em")
    })

    it("records capitalized JSX names as component usages", () => {
      const result = transformMithrilModule({
        id: "/p/usage.tsx",
        code: `/** @jsx m */\nimport m from "mithril"\nimport { Card } from "./card.js"\nexport const v = <Card title="hi" />\n`,
      })
      const usage = Object.values(result!.metadata.sources).find((s) => s.displayName === "Card")!
      expect(usage.kind).toBe("element")
      expect(usage.tagName).toBeUndefined()
    })

    it("supports .jsx modules and JSX fragments", () => {
      const result = transformMithrilModule({
        id: "/p/frag.jsx",
        code: `/** @jsx m */\nimport m from "mithril"\nexport const v = <>\n  <p>one</p>\n</>\n`,
      })
      expect(result).not.toBeNull()
      const fragment = Object.values(result!.metadata.sources).find((s) => s.tagName === "[")!
      expect(fragment.line).toBe(3)
    })
  })

  it("handles interleaved bindings, component forms and shadows in one module", () => {
    const result = transformMithrilModule({
      id: "/p/mixed.ts",
      code: [
        `import m from "mithril"`,
        `import { h } from "@app/mithril"`,
        `const helper = (m: (s: string) => string) => m("shadowed")`,
        `export const First = { view: () => m("nav", h("a", "link")) }`,
        `function plain() { return 42 }`,
        `export class Second { view() { return h("table") } }`,
        `export const Third = () => ({ view: () => m("tr") })`,
        ``,
      ].join("\n"),
      mithrilImports: ["mithril", "@app/mithril"],
      hyperscriptIdentifiers: ["m", "h"],
    })
    expect(result).not.toBeNull()
    const sources = Object.entries(result!.metadata.sources)

    // Local ids s1..sN are assigned in document order.
    expect(sources.map(([localId]) => localId)).toEqual(
      sources.map((_, index) => `s${index + 1}`),
    )
    const described = sources.map(
      ([, s]) => `${s.kind}${s.displayName ? `:${s.displayName}` : ""}${s.tagName ? `<${s.tagName}>` : ""}`,
    )
    expect(described).toEqual([
      "component-declaration:First",
      "component-view:First",
      "element<nav>",
      "element<a>",
      "component-declaration:Second",
      "component-view:Second",
      "element<table>",
      "component-declaration:Third",
      "component-view:Third",
      "element<tr>",
    ])
    // The shadowed call and the unrelated function stayed untouched.
    expect(result!.code).toContain(`m("shadowed")`)
    expect(result!.code).not.toMatch(/__miSource\("[^"]+", m\("shadowed"\)\)/)
  })

  describe("file filtering and resilience", () => {
    const MINIMAL = `import m from "mithril"\nexport const App = { view: () => m("main") }\n`

    it("returns null instead of throwing on syntax errors", () => {
      expect(
        transformMithrilModule({
          id: "/p/broken.ts",
          code: `import m from "mithril"\nexport const App = { view: () => m("main"\n`,
        }),
      ).toBeNull()
    })

    it("skips declaration files, virtual modules and unknown extensions", () => {
      expect(transformMithrilModule({ id: "/p/types.d.ts", code: MINIMAL })).toBeNull()
      expect(transformMithrilModule({ id: "\0virtual:some-module", code: MINIMAL })).toBeNull()
      expect(transformMithrilModule({ id: "/p/styles.css", code: MINIMAL })).toBeNull()
    })

    it("strips bundler queries from the id but still transforms the module", () => {
      const result = transformMithrilModule({ id: "/p/App.ts?v=123", code: MINIMAL, root: "/p" })
      expect(result).not.toBeNull()
      expect(result!.metadata.file).toBe("/p/App.ts")
      expect(result!.metadata.relativeFile).toBe("App.ts")
    })

    it("honors include and exclude filter patterns", () => {
      expect(
        transformMithrilModule({
          id: "/p/src/App.ts",
          code: MINIMAL,
          root: "/p",
          include: /\.tsx?$/,
          exclude: ["**/generated/**"],
        }),
      ).not.toBeNull()
      expect(
        transformMithrilModule({
          id: "/p/src/generated/App.ts",
          code: MINIMAL,
          root: "/p",
          include: /\.tsx?$/,
          exclude: ["**/generated/**"],
        }),
      ).toBeNull()
      expect(
        transformMithrilModule({ id: "/p/src/App.ts", code: MINIMAL, include: /\.vue$/ }),
      ).toBeNull()
    })
  })

  describe("determinism, registration payload and cache (§17, ADR-106)", () => {
    const MINIMAL = `import m from "mithril"\nexport const App = { view: () => m("main") }\n`

    it("emits the adapter-configured runtime import specifier (§11.2)", () => {
      const result = transformMithrilModule({
        id: "/p/App.ts",
        code: MINIMAL,
        runtimeModule: "virtual:mithril-inspector/runtime",
      })
      expect(result!.code).toContain(
        `from "virtual:mithril-inspector/runtime";`,
      )
    })

    it("registers an ADR-106 payload: { file, relativeFile, sources } keyed by local ids", () => {
      const result = transformMithrilModule({ id: "/p/src/App.ts", code: MINIMAL, root: "/p" })
      const match = /__miRegisterModule\("(m:[^"]+)", (\{.*?\})\);/.exec(result!.code)
      expect(match).not.toBeNull()
      const [, moduleId, payloadJson] = match!
      expect(moduleId).toBe(result!.metadata.id)
      const payload = JSON.parse(payloadJson!) as Record<string, unknown>
      expect(Object.keys(payload)).toEqual(["file", "relativeFile", "sources"])
      expect(payload.file).toBe("/p/src/App.ts")
      expect(payload.relativeFile).toBe("src/App.ts")
      const sources = payload.sources as Record<string, { line: number; kind: string }>
      for (const [localId, record] of Object.entries(sources)) {
        expect(localId).toMatch(/^s\d+$/)
        expect(record.line).toBeGreaterThan(0)
        expect(record.kind).toBeTruthy()
      }
    })

    it("produces byte-identical output for identical input, and a stable module id across edits", () => {
      clearTransformCache()
      const first = transformMithrilModule({ id: "/p/App.ts", code: MINIMAL, root: "/p" })
      clearTransformCache()
      const second = transformMithrilModule({ id: "/p/App.ts", code: MINIMAL, root: "/p" })
      expect(second!.code).toBe(first!.code)
      expect(second!.metadata).toEqual(first!.metadata)

      // ADR-106: the module id derives from the file path, so an edited file
      // re-registers under the same id and replaces its stale sources.
      const edited = transformMithrilModule({
        id: "/p/App.ts",
        code: `import m from "mithril"\n\nexport const App = { view: () => m("section") }\n`,
        root: "/p",
      })
      expect(edited!.metadata.id).toBe(first!.metadata.id)
      expect(edited!.code).not.toBe(first!.code)
    })

    it("caches by content and options", () => {
      clearTransformCache()
      const options = { id: "/p/App.ts", code: MINIMAL, root: "/p" }
      const first = transformMithrilModule(options)
      expect(transformMithrilModule({ ...options })).toBe(first)
      // A different option value must not hit the same entry.
      const other = transformMithrilModule({ ...options, runtimeModule: "virtual:x" })
      expect(other).not.toBe(first)
      // A content edit must not hit the same entry either.
      const edited = transformMithrilModule({ ...options, code: `${MINIMAL}\n` })
      expect(edited).not.toBe(first)
      clearTransformCache()
      expect(transformMithrilModule({ ...options })).not.toBe(first)
    })

    it("omits the source map when sourcemap is false", () => {
      const withMap = transformMithrilModule({ id: "/p/App.ts", code: MINIMAL })
      const withoutMap = transformMithrilModule({ id: "/p/App.ts", code: MINIMAL, sourcemap: false })
      expect(withMap!.map).toBeDefined()
      expect(withoutMap!.map).toBeUndefined()
    })
  })
})
