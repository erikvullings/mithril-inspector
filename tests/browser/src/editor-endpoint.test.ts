import { join } from "node:path"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { activatePicker, waitForShadowPresence } from "./harness/overlay.js"
import { createScenario, type Scenario } from "./harness/scenario.js"
import { positionOf } from "./harness/source-line.js"

/**
 * §19.2 assertion 5: the editor endpoint receives the expected file and line.
 * The launcher is mocked at the server boundary (task 0015 implementation
 * note) with a stub "editor" that records its argv instead of opening
 * anything real; this asserts on that recorded request.
 */
describe("editor endpoint receives the expected file and line (§19.2 assertion 5)", () => {
  let scenario: Scenario

  beforeAll(async () => {
    scenario = await createScenario()
  }, 30_000)

  beforeEach(async () => {
    await scenario.reload()
    await activatePicker(scenario.page())
  })

  afterAll(async () => {
    await scenario.teardown()
  })

  it("selecting an element launches the (stub) editor with its exact file/line/column", async () => {
    const page = scenario.page()
    await page.hover("#greeting")
    // openOnClick defaults to true (§8.7): clicking while picking both selects
    // and opens the editor in one action.
    await page.click("#greeting")
    await waitForShadowPresence(page, ".mi-section-title", true)

    const invocation = await scenario.editorStub.waitForInvocation()
    const { line, column } = positionOf(join(scenario.fixture.root, "src", "Greeting.ts"), 'm("h1#greeting')

    expect(invocation.file).toBe(join(scenario.fixture.root, "src", "Greeting.ts"))
    expect(invocation.line).toBe(line)
    expect(invocation.column).toBe(column)
  })

  it("never spawns a real editor process (only the harmless stub script runs)", async () => {
    const page = scenario.page()
    await page.hover("#greeting")
    await page.click("#greeting")

    const invocation = await scenario.editorStub.waitForInvocation()
    // The stub only ever records `{file, line, column}` — no component data
    // ever reaches the server boundary (§15), and no real editor launched.
    expect(Object.keys(invocation).sort()).toEqual(["column", "file", "line"])
  })
})
