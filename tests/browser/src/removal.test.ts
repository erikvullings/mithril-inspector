import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { activatePicker, shadowText, waitForShadowPresence, waitForShadowText } from "./harness/overlay.js"
import { mi } from "./harness/browser.js"
import { createScenario, type Scenario } from "./harness/scenario.js"

/** §19.2 assertion 8: removed nodes are not selectable / remain correctly flagged as stale. */
describe("removed nodes are no longer selectable (§19.2 assertion 8)", () => {
  let scenario: Scenario

  beforeAll(async () => {
    scenario = await createScenario()
  }, 30_000)

  beforeEach(async () => {
    await scenario.reload()
  })

  afterAll(async () => {
    await scenario.teardown()
  })

  it("selecting then removing an item shows 'no longer mounted' instead of stale data", async () => {
    const page = scenario.page()

    await activatePicker(page)
    await page.hover("#item-apple")
    await page.click("#item-apple")
    await waitForShadowPresence(page, ".mi-breadcrumb", true)
    expect(await shadowText(page, ".mi-crumb-current")).toBe("ListScene")

    // Selecting exits picking (non-continuous, §8.7), so this reaches the app directly.
    await page.click("#remove-apple")
    await page.waitForFunction(() => document.getElementById("item-apple") === null)

    // The overlay only re-checks `isConnected` when it next redraws (§8.8) —
    // switching sidebar sections is a real, deterministic redraw trigger, not a sleep.
    await page.click(mi('.mi-sidebar-btn[aria-label="Settings"]'))
    await page.click(mi('.mi-sidebar-btn[aria-label="Components"]'))

    await waitForShadowText(page, ".mi-stale", "Element no longer mounted")
    const staleText = await shadowText(page, ".mi-stale")
    expect(staleText).toContain("Element no longer mounted.")
  })

  it("removed elements cannot be hovered/selected again (their DOM node is gone)", async () => {
    const page = scenario.page()

    await page.click("#remove-apple")
    await page.waitForFunction(() => document.getElementById("item-apple") === null)

    const stillInDom = await page.evaluate(() => document.getElementById("item-apple") !== null)
    expect(stillInDom).toBe(false)

    await activatePicker(page)
    // Hovering where the removed item used to be now resolves whatever
    // currently occupies that DOM position (banana moved up), never "Apple".
    await page.hover("#item-list > li:first-child")
    await waitForShadowText(page, ".mi-hb-element", "item-banana")
  })
})
