import { join } from "node:path"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { activatePicker, shadowText, waitForShadowText } from "./harness/overlay.js"
import { createScenario, type Scenario } from "./harness/scenario.js"
import { positionOf } from "./harness/source-line.js"

/**
 * §19.2 assertion 3: hover displays the correct component. Also exercises the
 * fixture scenarios explicitly required alongside it: fragment-root
 * components (ADR-104) and multiple independent mount roots.
 */
describe("hover shows the correct component and source (§19.2 assertion 3)", () => {
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

  it("hovering the greeting shows its component and exact source line", async () => {
    const page = scenario.page()
    await page.hover("#greeting")
    await waitForShadowText(page, ".mi-hb-element", "h1#greeting")

    const componentName = await shadowText(page, ".mi-hb-component")
    expect(componentName).toBe("Greeting")

    const { line, column } = positionOf(join(scenario.fixture.root, "src", "Greeting.ts"), 'm("h1#greeting')
    const source = await shadowText(page, ".mi-hb-source")
    expect(source).toBe(`src/Greeting.ts:${line}:${column}`)
  })

  it("hovering a fragment-root component's elements resolves each one correctly (fragment roots)", async () => {
    const page = scenario.page()

    await page.hover("#frag-a")
    await waitForShadowText(page, ".mi-hb-element", "p#frag-a")
    expect(await shadowText(page, ".mi-hb-component")).toBe("FragmentScene")

    await page.hover("#frag-b")
    await waitForShadowText(page, ".mi-hb-element", "p#frag-b")
    expect(await shadowText(page, ".mi-hb-component")).toBe("FragmentScene")
  })

  it("hovering the second, independent mount root resolves correctly (multiple mount roots)", async () => {
    const page = scenario.page()
    await page.hover("#second-root-heading")
    await waitForShadowText(page, ".mi-hb-element", "h2#second-root-heading")
    expect(await shadowText(page, ".mi-hb-component")).toBe("SecondRoot")
  })
})
