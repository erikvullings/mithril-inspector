import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { mi } from "./harness/browser.js"
import { createScenario, type Scenario } from "./harness/scenario.js"

/** §19.2 assertions 1–2: the collapsed toggle appears, and picker mode activates. */
describe("inspector toggle and picker (§19.2 assertions 1, 2)", () => {
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

  it("shows the collapsed 'M' toggle (assertion 1)", async () => {
    const page = scenario.page()
    const toggle = await page.waitForSelector(mi(".mi-toggle"), { visible: true })
    expect(toggle).not.toBeNull()
    const label = await page.$eval(mi(".mi-toggle-btn:not(.mi-toggle-pick)"), (el) => el.textContent?.trim())
    expect(label).toBe("M")
  })

  it("activates picker mode directly from the collapsed toggle's target icon (assertion 2)", async () => {
    const page = scenario.page()
    await page.waitForSelector(mi(".mi-picker-btn"), { visible: true })

    const pressedBefore = await page.$eval(mi(".mi-picker-btn"), (el) => el.getAttribute("aria-pressed"))
    expect(pressedBefore).toBe("false")

    await page.click(mi(".mi-picker-btn"))
    await page.waitForFunction(
      (sel) => {
        const host = document.getElementById("__mithril-inspector-host")
        const button = host?.shadowRoot?.querySelector(sel)
        return button?.getAttribute("aria-pressed") === "true"
      },
      {},
      ".mi-picker-btn",
    )

    const banner = await page.waitForSelector(mi(".mi-picking-banner"), { visible: true })
    expect(banner).not.toBeNull()
    // Picking from the collapsed toggle doesn't expand the panel.
    expect(await page.$(mi(".mi-dock"))).toBeNull()
  })
})
