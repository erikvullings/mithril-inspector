import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { HOST_ID } from "@mithril-inspector/overlay"

import { activatePicker, waitForShadowPresence } from "./harness/overlay.js"
import { createScenario, type Scenario } from "./harness/scenario.js"

/**
 * Task 0030: a brief highlight over a component's DOM range when its own DOM
 * actually mutated this redraw — not every component whose `view()` merely
 * ran. Real Chromium, not jsdom, per this task's own investigation note:
 * jsdom's `MutationObserver` timing/coalescing isn't trusted to stand in for
 * the real thing on the timing-sensitive parts (rAF-throttled processing,
 * the flash's own auto-clear).
 */
describe("redraw-flash visualization (task 0030)", () => {
  let scenario: Scenario

  beforeAll(async () => {
    scenario = await createScenario({ redrawFlash: { enabled: true } })
    // The initial mount is itself a real DOM mutation (every node is newly
    // inserted) — let any flash it produces clear before testing anything
    // interaction-driven, so it can't be mistaken for the click's own flash.
    await waitForShadowPresence(scenario.page(), ".mi-flash-rect", false, 5_000)
  }, 30_000)

  afterAll(async () => {
    await scenario.teardown()
  })

  it("flashes Counter's own DOM range on a text-only redraw (no node replacement) and clears itself afterwards", async () => {
    const page = scenario.page()

    await page.click("#counter-btn")
    await waitForShadowPresence(page, ".mi-flash-rect", true)
    await waitForShadowPresence(page, ".mi-flash-rect", false)
  })

  it("attributes a mutation in the second, independent mount root correctly (§19.2 multiple mount roots)", async () => {
    const page = scenario.page()

    // `SecondRoot` renders static content with no interactive element of its
    // own to click — mutate it directly to prove the single `document.body`
    // `MutationObserver` (task 0030's chosen mechanism) really does cover
    // every independent `m.mount` root, not just the primary one `#app`
    // shares with the overlay's own event listeners.
    await page.evaluate(() => {
      document.querySelector("#second-root-heading")?.setAttribute("data-touched", "1")
    })
    await waitForShadowPresence(page, ".mi-flash-rect", true)
    await waitForShadowPresence(page, ".mi-flash-rect", false)
  })

  it("never flashes from the overlay's own picker/highlight activity", async () => {
    const page = scenario.page()

    await activatePicker(page)
    for (const selector of ["#counter-value", "#counter-btn", "#item-list"]) {
      await page.hover(selector).catch(() => {})
    }
    await page.keyboard.press("Escape")

    expect(
      await page.evaluate(
        (hostId) => document.getElementById(hostId)?.shadowRoot?.querySelectorAll(".mi-flash-rect").length ?? 0,
        HOST_ID,
      ),
    ).toBe(0)
  })
})
