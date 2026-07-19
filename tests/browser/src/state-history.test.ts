import type { Page } from "puppeteer"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { HOST_ID } from "@mithril-inspector/overlay"

import { mi } from "./harness/browser.js"
import { shadowClick, shadowTextAll, waitForShadowPresence } from "./harness/overlay.js"
import { createScenario, type Scenario } from "./harness/scenario.js"

/**
 * Task 0027 State History tab: a read-only timeline of a watched component's
 * state, recorded on each redraw — reusing the Components tab's existing
 * attrs/state capture (task 0022), not a real meiosis-tracer integration (see
 * TASKS/0027 for why: meiosis-tracer needs a live stream reference handed to
 * it, which would require app-code changes this project won't make).
 */
describe("State History tab (task 0027)", () => {
  let scenario: Scenario

  beforeAll(async () => {
    scenario = await createScenario({
      mode: "full",
      componentTree: { enabled: true, captureAttrs: true, captureState: true },
    })
  }, 30_000)

  beforeEach(async () => {
    await scenario.reload()
  })

  afterAll(async () => {
    await scenario.teardown()
  })

  async function openComponentsTab(page: Page): Promise<void> {
    const toggle = await page.$(mi(".mi-toggle"))
    if (toggle !== null) await page.click(mi(".mi-toggle-btn:not(.mi-toggle-pick)"))
    await waitForShadowPresence(page, ".mi-tree-search", true)
  }

  it("accumulates a state snapshot each time the watched component redraws, and clears when a different component is watched", async () => {
    const page = scenario.page()
    await openComponentsTab(page)

    const names = await shadowTextAll(page, ".mi-tree-name")
    const counterIndex = names.findIndex((n) => n === "Counter")
    expect(counterIndex).toBeGreaterThanOrEqual(0)
    await shadowClick(page, ".mi-tree-name", counterIndex)

    await page.click(mi('.mi-sidebar-btn[aria-label="State History"]'))
    await waitForShadowPresence(page, ".mi-history", true)
    expect(await shadowTextAll(page, ".mi-history-list li")).toEqual([])

    await page.click("#counter-btn")
    await page.click("#counter-btn")
    await page.click("#counter-btn")

    await page.waitForFunction(
      (hostId) => {
        const host = document.getElementById(hostId)
        return (host?.shadowRoot?.querySelectorAll(".mi-history-list li").length ?? 0) >= 3
      },
      { timeout: 5_000 },
      HOST_ID,
    )

    // Switching the watched component (back to the Components tab, selecting
    // Greeting) resets the buffer — the History tab is scoped to whichever
    // component is currently selected, not a global log.
    await page.click(mi('.mi-sidebar-btn[aria-label="Components"]'))
    await waitForShadowPresence(page, ".mi-tree-search", true)
    const namesAgain = await shadowTextAll(page, ".mi-tree-name")
    const greetingIndex = namesAgain.findIndex((n) => n === "Greeting")
    expect(greetingIndex).toBeGreaterThanOrEqual(0)
    await shadowClick(page, ".mi-tree-name", greetingIndex)

    await page.click(mi('.mi-sidebar-btn[aria-label="State History"]'))
    await waitForShadowPresence(page, ".mi-history", true)
    expect(await shadowTextAll(page, ".mi-history-list li")).toEqual([])
  })

  it("shows a gating message instead of a timeline once a component is watched but mode isn't full", async () => {
    // componentTree stays enabled (so a component can be selected in the tree
    // at all), but mode defaults to "source" — the same gate the Components
    // tab's own Attrs/State sections use (task 0022), reused as-is here.
    const gated = await createScenario({ componentTree: { enabled: true, captureAttrs: false, captureState: false } })
    try {
      const page = gated.page()
      await openComponentsTab(page)

      const names = await shadowTextAll(page, ".mi-tree-name")
      const counterIndex = names.findIndex((n) => n === "Counter")
      expect(counterIndex).toBeGreaterThanOrEqual(0)
      await shadowClick(page, ".mi-tree-name", counterIndex)

      await page.click(mi('.mi-sidebar-btn[aria-label="State History"]'))
      await waitForShadowPresence(page, ".mi-history", true)
      const text = (await page.$eval(mi(".mi-history"), (el) => el.textContent)) ?? ""
      expect(text).toContain('Enable mode: "full"')
    } finally {
      await gated.teardown()
    }
  })
})
