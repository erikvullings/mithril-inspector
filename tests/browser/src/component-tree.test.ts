import type { Page } from "puppeteer"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { HOST_ID } from "@mithril-inspector/overlay"

import { mi } from "./harness/browser.js"
import { activatePicker, shadowClick, shadowText, shadowTextAll, waitForShadowPresence } from "./harness/overlay.js"
import { createScenario, type Scenario } from "./harness/scenario.js"

/**
 * Task 0022 component-tree UI: tree rendering, bidirectional selection sync
 * (§9.3), and keyed-reorder identity (§19.2 "keyed reordering" applied to the
 * Components tab). `componentTree.enabled`/`mode: "full"` are off by default
 * (task 0013/0022), so this scenario opts in explicitly.
 */
describe("Components tab: full component tree (§9, §9.3, §9.4, task 0022)", () => {
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

  /** Opens the docked panel (if collapsed), without engaging the picker — the merged view shows the tree by default. */
  async function openComponentsTab(page: Page): Promise<void> {
    const toggle = await page.$(mi(".mi-toggle"))
    if (toggle !== null) await page.click(mi(".mi-toggle-btn:not(.mi-toggle-pick)"))
    await waitForShadowPresence(page, ".mi-tree-search", true)
  }

  it("renders the playground's component hierarchy with display names and keys (§9.1)", async () => {
    const page = scenario.page()
    await openComponentsTab(page)

    const names = await shadowTextAll(page, ".mi-tree-name")
    expect(names).toContain("Layout")
    expect(names).toContain("Greeting")
    expect(names).toContain("Counter")
    expect(names).toContain("ListScene")
    expect(names).toContain("FragmentScene")
    expect(names).toContain("UserList")
    // §9.1's own example format: `UserCard key="42"`.
    expect(names.filter((n) => n.startsWith("UserCard")).sort()).toEqual(['UserCard key="42"', 'UserCard key="84"'])

    // Plain DOM elements (main, div, ul, li, button...) are excluded by default.
    expect(names.some((n) => n.toLowerCase().includes("div"))).toBe(false)
  })

  it("selecting an element in the Inspector tab marks its nearest component selected in the tree (DOM -> tree, §9.3)", async () => {
    const page = scenario.page()
    await activatePicker(page)
    await page.hover("#greeting")
    await page.click("#greeting")

    await openComponentsTab(page)
    const selectedText = await page.evaluate((hostId) => {
      const host = document.getElementById(hostId)
      const row = host?.shadowRoot?.querySelector('[role="treeitem"][aria-selected="true"]')
      return row?.querySelector(".mi-tree-name")?.textContent ?? null
    }, HOST_ID)
    expect(selectedText).toBe("Greeting")
  })

  it("selecting a component in the tree highlights its DOM range (tree -> DOM, §9.3)", async () => {
    const page = scenario.page()
    await openComponentsTab(page)

    const cardRect = await page.evaluate(() => {
      const box = document.getElementById("user-42")!.getBoundingClientRect()
      return { left: `${box.left}px`, top: `${box.top}px` }
    })

    const names = await shadowTextAll(page, ".mi-tree-name")
    const index = names.findIndex((n) => n === 'UserCard key="42"')
    expect(index).toBeGreaterThanOrEqual(0)
    await shadowClick(page, ".mi-tree-name", index)

    await page.waitForFunction(
      (hostId, expectedLeft) => {
        const host = document.getElementById(hostId)
        const rect = host?.shadowRoot?.querySelector(".mi-rect-frozen") as HTMLElement | null
        return rect?.style.left === expectedLeft
      },
      { timeout: 5_000 },
      HOST_ID,
      cardRect.left,
    )
    const frozenTop = await page.evaluate((hostId) => {
      const host = document.getElementById(hostId)
      const rect = host?.shadowRoot?.querySelector(".mi-rect-frozen") as HTMLElement | null
      return rect?.style.top ?? null
    }, HOST_ID)
    expect(frozenTop).toBe(cardRect.top)
    expect(await shadowText(page, ".mi-crumb-current")).toBe('UserCard key="42"')
  })

  it("keeps each UserCard's tree/DOM association correct after a keyed reorder", async () => {
    const page = scenario.page()
    await openComponentsTab(page)

    // Sanity: Ada (key 42) renders first.
    const firstIdBefore = await page.$eval("#user-list > li:first-child", (el) => el.id)
    expect(firstIdBefore).toBe("user-42")

    await page.click("#reorder-users-btn")
    await page.waitForFunction(() => document.querySelector("#user-list > li:first-child")?.id === "user-84")

    // The tree still lists exactly the two same keyed instances, now in the new
    // render order — the batched components-updated patch (task 0021) and the
    // overlay's own listener-triggered redraw are each scheduled independently
    // of the app's own DOM mutation, so poll rather than assert immediately.
    await page.waitForFunction(
      (hostId) => {
        const host = document.getElementById(hostId)
        const names = Array.from(host?.shadowRoot?.querySelectorAll(".mi-tree-name") ?? [])
          .map((el) => el.textContent)
          .filter((n): n is string => n !== null && n.startsWith("UserCard"))
        return names.length === 2 && names[0] === 'UserCard key="84"' && names[1] === 'UserCard key="42"'
      },
      { timeout: 5_000 },
      HOST_ID,
    )

    // Selecting the (now second) key=42 card highlights *its* new screen position, not the old one.
    const newCardRect = await page.evaluate(() => {
      const box = document.getElementById("user-42")!.getBoundingClientRect()
      return { left: `${box.left}px`, top: `${box.top}px` }
    })
    const allNames = await shadowTextAll(page, ".mi-tree-name")
    const liveIndex = allNames.findIndex((n) => n === 'UserCard key="42"')
    expect(liveIndex).toBeGreaterThanOrEqual(0)
    await shadowClick(page, ".mi-tree-name", liveIndex)

    await page.waitForFunction(
      (hostId, expectedLeft) => {
        const host = document.getElementById(hostId)
        const rect = host?.shadowRoot?.querySelector(".mi-rect-frozen") as HTMLElement | null
        return rect?.style.left === expectedLeft
      },
      { timeout: 5_000 },
      HOST_ID,
      newCardRect.left,
    )
  })
})
