import type { Page } from "puppeteer"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { HOST_ID } from "@mithril-inspector/overlay"

import { mi } from "./harness/browser.js"
import { shadowClick, shadowTextAll, waitForShadowPresence } from "./harness/overlay.js"
import { createScenario, type Scenario } from "./harness/scenario.js"

/**
 * Elements tab (task 0031, REQUIREMENTS.md §9.1's optional "expansion of a
 * component into its owned vnode/element tree") against a real, non-jsdom
 * page — `UserList` (`fixtures/app/src/UserList.ts`) renders
 * `div.user-list-scene > [button#reorder-users-btn, ul#user-list > UserCard*]`,
 * so selecting it exercises both plain-element rows and the child-component
 * boundary link (each `<li class="user-card">` is a `UserCard` instance's own
 * `domRange.first`).
 */
describe("Elements tab (task 0031, §9.1 optional 'owned vnode/element tree' expansion)", () => {
  let scenario: Scenario

  beforeAll(async () => {
    scenario = await createScenario({ componentTree: { enabled: true } })
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

  it("renders the selected component's own DOM as mithril hyperscript labels, replacing nested UserCard children with link chips instead of their raw markup", async () => {
    const page = scenario.page()
    await openComponentsTab(page)

    const names = await shadowTextAll(page, ".mi-tree-name")
    const index = names.indexOf("UserList")
    expect(index).toBeGreaterThanOrEqual(0)
    await shadowClick(page, ".mi-tree-name", index)

    await page.click(mi('.mi-sidebar-btn[aria-label="Elements"]'))
    await waitForShadowPresence(page, ".mi-elements-tree", true)

    const rowLabels = await shadowTextAll(page, ".mi-elements-row")
    expect(rowLabels).toContain("div.user-list-scene")
    expect(rowLabels).toContain("button#reorder-users-btn")
    expect(rowLabels).toContain("ul#user-list")
    // The two UserCard children never appear as raw <li class="user-card"> rows.
    expect(rowLabels.some((label) => label.includes("user-card"))).toBe(false)

    const links = await shadowTextAll(page, ".mi-preview-component-link")
    expect(links.filter((label) => label === "UserCard")).toHaveLength(2)
  })

  it("clicking a nested component's link chip re-selects it, updating the Components tab's own selection (§9.3)", async () => {
    const page = scenario.page()
    await openComponentsTab(page)

    const names = await shadowTextAll(page, ".mi-tree-name")
    await shadowClick(page, ".mi-tree-name", names.indexOf("UserList"))
    await page.click(mi('.mi-sidebar-btn[aria-label="Elements"]'))
    await waitForShadowPresence(page, ".mi-preview-component-link", true)

    await shadowClick(page, ".mi-preview-component-link", 0)

    await page.click(mi('.mi-sidebar-btn[aria-label="Components"]'))
    await waitForShadowPresence(page, '[role="treeitem"][aria-selected="true"]', true)
    const selectedText = await page.evaluate((hostId) => {
      const host = document.getElementById(hostId)
      const row = host?.shadowRoot?.querySelector('[role="treeitem"][aria-selected="true"]')
      return row?.querySelector(".mi-tree-name")?.textContent ?? null
    }, HOST_ID)
    expect(selectedText).toContain("UserCard")
  })

  it("shows the empty-state message until a component is selected", async () => {
    const page = scenario.page()
    await openComponentsTab(page)
    await page.click(mi('.mi-sidebar-btn[aria-label="Elements"]'))
    await waitForShadowPresence(page, ".mi-detail-empty", true)
  })
})
