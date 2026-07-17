import { join } from "node:path"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { activatePicker, shadowDetailRow, waitForShadowPresence } from "./harness/overlay.js"
import { createScenario, type Scenario } from "./harness/scenario.js"
import { positionOf } from "./harness/source-line.js"

/**
 * §19.2 assertion 4: click selects the correct source. Also assertion 6
 * (component ancestry): only the *nearest* owning component is available in
 * Phase 1 (overlay README "Known Phase 1 limitations"), so this only checks
 * that the nearest component resolved is correct; full multi-level ancestry
 * is tracked as a pending follow-up until 0019 lands.
 */
describe("click selects the correct source (§19.2 assertion 4)", () => {
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

  it("clicking the greeting selects it and shows the correct component/source", async () => {
    const page = scenario.page()
    await page.hover("#greeting")
    await page.click("#greeting")

    await waitForShadowPresence(page, ".mi-section-title", true)
    expect(await shadowDetailRow(page, "Component")).toBe("Greeting")
    // The "Selected" panel's Element row is tag+classes only, no id (view.ts
    // `describeSelected`) — unlike the hover badge's `describeElement`.
    expect(await shadowDetailRow(page, "Element")).toBe("h1.greeting")

    const { line, column } = positionOf(join(scenario.fixture.root, "src", "Greeting.ts"), 'm("h1#greeting')
    expect(await shadowDetailRow(page, "Source")).toBe(`src/Greeting.ts:${line}:${column}`)
  })

  it("selecting a list item resolves its nearest owning component (assertion 6, nearest-only)", async () => {
    const page = scenario.page()
    await page.hover("#item-apple")
    await page.click("#item-apple")

    await waitForShadowPresence(page, ".mi-section-title", true)
    expect(await shadowDetailRow(page, "Component")).toBe("ListScene")

    const ancestryText = await page.evaluate(() => {
      const host = document.getElementById("__mithril-inspector-host")
      const paragraphs = Array.from(host?.shadowRoot?.querySelectorAll(".mi-muted") ?? [])
      return paragraphs.map((p) => p.textContent).find((text) => text?.startsWith("Nearest component:")) ?? null
    })
    expect(ancestryText).toBe("Nearest component: ListScene. Full ancestry arrives with the component tree.")
  })

  // Pending until 0019 (component tree / full ancestry) lands: Phase 1 only
  // exposes the nearest owning component, not the full Layout -> ListScene
  // ancestor chain (§19.2 assertion 6, overlay README known limitations).
  it.todo("full multi-level ancestry chain is reported (blocked on 0019)")
})
