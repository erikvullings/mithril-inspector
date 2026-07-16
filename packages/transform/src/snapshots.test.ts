import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { transformMithrilModule } from "./transform.js"

/**
 * §19.1 fixture-based snapshot tests. Executed-fixture coverage lives in
 * execute.test.ts; these snapshots pin the exact emitted code so accidental
 * output changes are visible in review.
 */

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8")

const transformFixture = (name: string) =>
  transformMithrilModule({ id: `/fixtures/${name}`, code: fixture(name), root: "/" })

const INSTRUMENTED_FIXTURES = [
  "user-card.ts",
  "aliased-import.ts",
  "renamed-default.ts",
  "require-import.js",
  "closure-component.ts",
  "class-component.ts",
  "inline-component.ts",
  "anonymous-default.ts",
  "nested-calls.ts",
  "fragments.ts",
  "arrays.ts",
  "keyed-list.ts",
  "trusted-html.ts",
  "odd-formatting.ts",
  "hello.tsx",
] as const

const UNTOUCHED_FIXTURES = ["unrelated-m.ts", "no-mithril.ts", "syntax-error.ts"] as const

describe("fixture snapshots (§19.1)", () => {
  for (const name of INSTRUMENTED_FIXTURES) {
    it(`instruments ${name}`, () => {
      const result = transformFixture(name)
      expect(result).not.toBeNull()
      expect(result!.code).toMatchSnapshot("code")
      expect(result!.metadata).toMatchSnapshot("metadata")
    })
  }

  for (const name of UNTOUCHED_FIXTURES) {
    it(`returns null for ${name}`, () => {
      expect(transformFixture(name)).toBeNull()
    })
  }
})
