import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { activatePicker, cancelPicker, shadowText, waitForShadowText } from "./harness/overlay.js"
import { createScenario, type Scenario } from "./harness/scenario.js"

/**
 * §19.2 assertion 7: redraws update mappings. Shuffling the keyed list
 * physically reorders DOM nodes (§19.2 "keyed reordering"); hovering the same
 * screen slot before/after must describe whichever item now actually occupies
 * it, proving the DOM/source association isn't left stale after the redraw.
 */
describe("redraws update DOM/source mappings (§19.2 assertion 7)", () => {
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

  it("hovering the first list slot describes whichever item currently occupies it", async () => {
    const page = scenario.page()

    // Sanity: the first slot starts out as "apple".
    const firstItemIdBefore = await page.$eval("#item-list > li:first-child", (el) => el.id)
    expect(firstItemIdBefore).toBe("item-apple")

    await activatePicker(page)
    await page.hover("#item-list > li:first-child")
    await waitForShadowText(page, ".mi-hb-element", "item-apple")
    expect(await shadowText(page, ".mi-hb-element")).toBe("li#item-apple.list-item")

    // The picker intercepts every click while active (§8.7), so the app's own
    // shuffle button would never fire — cancel picking first (Escape), click
    // shuffle as a normal app interaction, then resume picking to re-check the
    // same screen slot.
    await cancelPicker(page)
    await page.click("#shuffle-btn")
    // Mithril's redraw after the click isn't guaranteed to land before
    // `page.click()` resolves — wait on the DOM condition, not a fixed sleep.
    await page.waitForFunction(
      () => document.querySelector("#item-list > li:first-child")?.id === "item-banana",
    )
    // Shuffle rotates [apple, banana, cherry] -> [banana, cherry, apple] (ListScene.ts `shuffle`).
    const firstItemIdAfter = await page.$eval("#item-list > li:first-child", (el) => el.id)
    expect(firstItemIdAfter).toBe("item-banana")

    await activatePicker(page)
    await page.hover("#item-list > li:first-child")
    await waitForShadowText(page, ".mi-hb-element", "item-banana")
    expect(await shadowText(page, ".mi-hb-element")).toBe("li#item-banana.list-item")
  })
})
