import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { activatePicker, shadowText, waitForShadowPresence } from "./harness/overlay.js"
import { createScenario, type Scenario } from "./harness/scenario.js"

/**
 * §19.2 assertion 9: overlay interactions do not trigger application click
 * handlers. Clicking the counter button while picking must select it (not
 * increment it); the same click before/after picking must behave normally.
 */
describe("overlay interactions do not trigger application click handlers (§19.2 assertion 9)", () => {
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

  it("suppresses the app's click handler while picking, and restores it afterwards", async () => {
    const page = scenario.page()

    // Sanity: the handler genuinely works before the picker gets involved.
    await page.click("#counter-btn")
    await page.waitForFunction(() => document.querySelector("#counter-value")?.textContent === "1")

    await activatePicker(page)
    await page.hover("#counter-btn")
    await page.click("#counter-btn")
    await waitForShadowPresence(page, ".mi-breadcrumb", true)

    // The click was intercepted for selection, not passed to the app.
    expect(await page.$eval("#counter-value", (el) => el.textContent)).toBe("1")
    expect(await shadowText(page, ".mi-crumb-current")).toBe("Counter")

    // Picking auto-exits after a non-continuous selection (§8.7): the next
    // click on the same button reaches the app again, unaffected.
    await page.click("#counter-btn")
    await page.waitForFunction(() => document.querySelector("#counter-value")?.textContent === "2")
  })
})
