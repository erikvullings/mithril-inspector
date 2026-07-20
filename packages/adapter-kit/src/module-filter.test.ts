import { describe, expect, it } from "vitest"

import { shouldAttemptTransform } from "./module-filter.js"

describe("shouldAttemptTransform (§11.2)", () => {
  it("instruments ordinary application source files", () => {
    expect(shouldAttemptTransform("/app/src/App.ts")).toBe(true)
    expect(shouldAttemptTransform("/app/src/components/Button.tsx")).toBe(true)
    expect(shouldAttemptTransform("/app/src/App.ts?used")).toBe(true)
  })

  it("skips NUL-prefixed virtual modules", () => {
    expect(shouldAttemptTransform("\0virtual:mithril-inspector/runtime")).toBe(false)
    expect(shouldAttemptTransform("\0commonjsHelpers.js")).toBe(false)
  })

  it("skips node_modules dependencies (including mithril itself)", () => {
    expect(shouldAttemptTransform("/app/node_modules/mithril/index.js")).toBe(false)
    expect(shouldAttemptTransform("/app/node_modules/@mithril-inspector/runtime/dist/index.js")).toBe(false)
  })

  it("skips the inspector's own packages when symlinked in a monorepo (self)", () => {
    expect(shouldAttemptTransform("/repo/mithril-inspector/packages/overlay/dist/index.js")).toBe(false)
    expect(shouldAttemptTransform("/repo/mithril-inspector/packages/runtime/dist/runtime.js")).toBe(false)
  })

  it("skips the rollup adapter and shared adapter-kit packages (self)", () => {
    expect(shouldAttemptTransform("/app/node_modules/@mithril-inspector/rollup/dist/index.js")).toBe(false)
    expect(shouldAttemptTransform("/app/node_modules/@mithril-inspector/adapter-kit/dist/index.js")).toBe(false)
    expect(shouldAttemptTransform("/repo/mithril-inspector/packages/rollup/dist/plugin.js")).toBe(false)
  })
})
