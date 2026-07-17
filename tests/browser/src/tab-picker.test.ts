import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { mi } from "./harness/browser.js"
import { createScenario, type Scenario } from "./harness/scenario.js"

/** §19.2 assertions 1–2: the tab appears, and picker mode activates. */
describe("inspector tab and picker (§19.2 assertions 1, 2)", () => {
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

  it("shows the collapsed inspector tab (assertion 1)", async () => {
    const page = scenario.page()
    const tab = await page.waitForSelector(mi(".mi-tab"), { visible: true })
    expect(tab).not.toBeNull()
    const label = await page.$eval(mi(".mi-tab"), (el) => el.textContent?.trim())
    expect(label).toContain("Mithril Inspect")
  })

  it("activates picker mode from the panel button (assertion 2)", async () => {
    const page = scenario.page()
    await page.click(mi(".mi-tab"))
    await page.waitForSelector(mi("button[aria-pressed]"), { visible: true })

    const pressedBefore = await page.$eval(mi("button[aria-pressed]"), (el) => el.getAttribute("aria-pressed"))
    expect(pressedBefore).toBe("false")

    await page.click(mi("button[aria-pressed]"))
    await page.waitForFunction(
      (sel) => {
        const host = document.getElementById("__mithril-inspector-host")
        const button = host?.shadowRoot?.querySelector(sel)
        return button?.getAttribute("aria-pressed") === "true"
      },
      {},
      "button[aria-pressed]",
    )

    const banner = await page.waitForSelector(mi(".mi-picking-banner"), { visible: true })
    expect(banner).not.toBeNull()
  })
})
