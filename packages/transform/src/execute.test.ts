import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { afterAll, describe, expect, it } from "vitest"

import type { ModuleRegistration } from "./types.js"
import { chainThroughEsbuild } from "./testkit.js"
import { transformMithrilModule } from "./transform.js"

/**
 * §19.1: "Do not rely solely on transformed-code snapshots. Execute
 * transformed fixtures where possible." These tests compile transformed
 * fixtures with esbuild (as Vite would), import them against a stub runtime,
 * and verify both the registration protocol and that rendering semantics are
 * untouched (§2.3).
 */

const packageDir = fileURLToPath(new URL("..", import.meta.url))
// Inside the package so the compiled modules still resolve the real "mithril".
const outDir = mkdtempSync(join(packageDir, ".exec-tmp-"))
afterAll(() => rmSync(outDir, { recursive: true, force: true }))

const RUNTIME_STUB = `
export const calls = []
export function registerModule(moduleId, registration) {
  calls.push({ helper: "registerModule", moduleId, registration })
}
export function source(sourceId, vnode) {
  calls.push({ helper: "source", sourceId })
  return vnode
}
export function component(sourceId, comp) {
  calls.push({ helper: "component", sourceId })
  return comp
}
`
writeFileSync(join(outDir, "runtime-stub.mjs"), RUNTIME_STUB)

interface StubModule {
  calls: Array<{ helper: string; moduleId?: string; registration?: ModuleRegistration; sourceId?: string }>
}

const importStub = async (): Promise<StubModule> =>
  (await import(pathToFileURL(join(outDir, "runtime-stub.mjs")).href)) as StubModule

const fixtureSource = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8")

/** Compiles (and optionally transforms) a fixture and imports it. */
const executeFixture = async (
  name: string,
  { instrument }: { instrument: boolean },
): Promise<{ module: Record<string, unknown>; metadata: ReturnType<typeof transformMithrilModule> }> => {
  const code = fixtureSource(name)
  const loader = name.endsWith(".tsx") ? "tsx" : "ts"
  const result = instrument
    ? transformMithrilModule({ id: `/fixtures/${name}`, code, root: "/", runtimeModule: "./runtime-stub.mjs" })
    : null
  if (instrument) expect(result).not.toBeNull()
  const compiled = await chainThroughEsbuild(result?.code ?? code, { loader })
  const outFile = join(outDir, `${instrument ? "instrumented" : "original"}-${name.replace(/\.tsx?$/, ".mjs")}`)
  writeFileSync(outFile, compiled.code)
  const module = (await import(pathToFileURL(outFile).href)) as Record<string, unknown>
  return { module, metadata: result }
}

/** Structural summary of a vnode tree: tags, text and key order only. */
const summarize = (vnode: unknown): unknown => {
  if (vnode === null || vnode === undefined || typeof vnode !== "object") return vnode
  if (Array.isArray(vnode)) return vnode.map(summarize)
  const record = vnode as { tag?: unknown; key?: unknown; text?: unknown; children?: unknown }
  return {
    tag: typeof record.tag === "string" ? record.tag : "<component>",
    key: record.key ?? null,
    text: record.text ?? null,
    children: summarize(record.children ?? null),
  }
}

type ObjectComponent = { view: (vnode: { attrs: Record<string, unknown> }) => unknown }

describe("executed transformed fixtures (§19.1)", () => {
  it("registers the module and preserves the rendered vnode tree of an object component", async () => {
    const stub = await importStub()
    const attrs = { name: "Ada", onEdit: () => undefined }
    const original = await executeFixture("user-card.ts", { instrument: false })
    const instrumented = await executeFixture("user-card.ts", { instrument: true })

    const registration = stub.calls.find(
      (call) => call.helper === "registerModule" && call.moduleId === instrumented.metadata!.metadata.id,
    )
    expect(registration).toBeDefined()
    expect(registration!.registration!.relativeFile).toBe("fixtures/user-card.ts")
    expect(Object.keys(registration!.registration!.sources)).toEqual(
      Object.keys(instrumented.metadata!.metadata.sources),
    )

    // The component declaration was tagged at import time.
    expect(stub.calls.some((call) => call.helper === "component")).toBe(true)

    const originalTree = summarize((original.module.UserCard as ObjectComponent).view({ attrs }))
    const callsBeforeRender = stub.calls.length
    const instrumentedTree = summarize((instrumented.module.UserCard as ObjectComponent).view({ attrs }))
    expect(instrumentedTree).toEqual(originalTree)

    // Rendering reported one source id per element, all registered.
    const sourceCalls = stub.calls.slice(callsBeforeRender).filter((call) => call.helper === "source")
    expect(sourceCalls).toHaveLength(4)
    for (const call of sourceCalls) {
      const localId = call.sourceId!.split(":").at(-1)!
      expect(instrumented.metadata!.metadata.sources[localId]).toBeDefined()
    }
  })

  it("preserves closure component behavior", async () => {
    const original = await executeFixture("closure-component.ts", { instrument: false })
    const instrumented = await executeFixture("closure-component.ts", { instrument: true })
    type Factory = () => ObjectComponent
    const originalTree = summarize((original.module.Counter as Factory)().view({ attrs: {} }))
    const instrumentedTree = summarize((instrumented.module.Counter as Factory)().view({ attrs: {} }))
    expect(instrumentedTree).toEqual(originalTree)
  })

  it("preserves keyed-list output including keys", async () => {
    const original = await executeFixture("keyed-list.ts", { instrument: false })
    const instrumented = await executeFixture("keyed-list.ts", { instrument: true })
    const originalTree = summarize((original.module.KeyedList as ObjectComponent).view({ attrs: {} }))
    const instrumentedTree = summarize((instrumented.module.KeyedList as ObjectComponent).view({ attrs: {} }))
    expect(instrumentedTree).toEqual(originalTree)
    expect(JSON.stringify(instrumentedTree)).toContain('"key":"alpha"')
  })

  it("executes an instrumented TSX module through the esbuild JSX pipeline", async () => {
    const stub = await importStub()
    const original = await executeFixture("hello.tsx", { instrument: false })
    const instrumented = await executeFixture("hello.tsx", { instrument: true })
    const attrs = { subject: "world" }
    const originalTree = summarize((original.module.Hello as ObjectComponent).view({ attrs }))
    const instrumentedTree = summarize((instrumented.module.Hello as ObjectComponent).view({ attrs }))
    expect(instrumentedTree).toEqual(originalTree)
    expect(
      stub.calls.some(
        (call) =>
          call.helper === "registerModule" && call.moduleId === instrumented.metadata!.metadata.id,
      ),
    ).toBe(true)
  })
})
